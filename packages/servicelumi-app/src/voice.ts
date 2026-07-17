/**
 * ServiceLumi voice command service. Binds the product to the EXISTING Lumi
 * Voice chain: every turn first passes `evaluateVoiceIntake` (which wraps the
 * canonical `evaluateVoiceTurn`, PTT-only) and is UNTRUSTED by construction.
 * The transcript is then parsed by a deterministic intent matcher — never by
 * an unguarded model — and the intent passes deny-by-default role
 * authorization. Read intents execute immediately; state-changing intents
 * always stop at PENDING_APPROVAL until a human confirms them in the UI
 * (H6.1/H6.3: approval is per-command and never assumed). Every turn and
 * every confirmation is audited with IMEI/credential redaction (PV24.3).
 */

import { decide } from "../../tenant-boundary/src/index.js";
import type { TenantDecision } from "../../tenant-boundary/src/index.js";
import { evaluateVoiceIntake } from "../../servicelumi-adapters/src/index.js";
import type { ServiceLumiCore, ServiceModuleKey, WorkOrderQuote } from "../../servicelumi-core/src/index.js";
import { customerId, deviceId, redactForLog, technicianId, workOrderId } from "../../servicelumi-core/src/index.js";
import type { AppRole, AppSession } from "./session.js";

export type VoiceIntentKind =
  | "OPEN_INTAKE"
  | "SHOW_CUSTOMER_DEVICES"
  | "ASSIGN_TECHNICIAN"
  | "SET_WAITING_PARTS"
  | "DRAFT_QUOTE"
  | "SHOW_OVERDUE"
  | "SHOW_CRITICAL_STOCK"
  | "DRAFT_READY_NOTIFICATION"
  | "UNRECOGNIZED";

export interface VoiceIntent {
  readonly kind: VoiceIntentKind;
  readonly moduleKey?: ServiceModuleKey;
}

/** Lower-cases and folds Turkish diacritics so matching is deterministic. */
function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o");
}

/** Deterministic keyword matcher — no model, no fuzzy scoring, no surprises. */
export function parseVoiceIntent(transcript: string): VoiceIntent {
  const t = fold(transcript);
  const has = (...words: string[]) => words.every((w) => t.includes(w));
  if (has("yeni", "servis") || has("yeni", "kayit") || has("kayd", "ac")) {
    if (has("televizyon") || has(" tv")) {
      return { kind: "OPEN_INTAKE", moduleKey: "tv_service" };
    }
    if (has("bilgisayar") || has("laptop")) {
      return { kind: "OPEN_INTAKE", moduleKey: "computer_service" };
    }
    if (has("telefon")) {
      return { kind: "OPEN_INTAKE", moduleKey: "phone_service" };
    }
    if (has("beyaz esya") || has("camasir") || has("buzdolabi")) {
      return { kind: "OPEN_INTAKE", moduleKey: "appliance_service" };
    }
    return { kind: "OPEN_INTAKE" };
  }
  if (has("musteri") && has("cihaz") && (has("goster") || has("listele"))) {
    return { kind: "SHOW_CUSTOMER_DEVICES" };
  }
  if (has("teknisyen") && (has("ata") || has("atama"))) {
    return { kind: "ASSIGN_TECHNICIAN" };
  }
  if (has("parca bekl")) {
    return { kind: "SET_WAITING_PARTS" };
  }
  if (has("teklif")) {
    return { kind: "DRAFT_QUOTE" };
  }
  if (has("geciken")) {
    return { kind: "SHOW_OVERDUE" };
  }
  if (has("stok")) {
    return { kind: "SHOW_CRITICAL_STOCK" };
  }
  if (has("hazir") && has("bildirim")) {
    return { kind: "DRAFT_READY_NOTIFICATION" };
  }
  return { kind: "UNRECOGNIZED" };
}

/** Deny-by-default role authorization: an intent absent from the list is denied. */
const ROLE_ALLOWED_INTENTS: Readonly<Record<AppRole, readonly VoiceIntentKind[]>> = Object.freeze({
  OWNER: Object.freeze<VoiceIntentKind[]>([
    "OPEN_INTAKE", "SHOW_CUSTOMER_DEVICES", "ASSIGN_TECHNICIAN", "SET_WAITING_PARTS",
    "DRAFT_QUOTE", "SHOW_OVERDUE", "SHOW_CRITICAL_STOCK", "DRAFT_READY_NOTIFICATION"
  ]),
  RECEPTION: Object.freeze<VoiceIntentKind[]>([
    "OPEN_INTAKE", "SHOW_CUSTOMER_DEVICES", "DRAFT_QUOTE", "SHOW_OVERDUE", "DRAFT_READY_NOTIFICATION"
  ]),
  TECHNICIAN: Object.freeze<VoiceIntentKind[]>([
    "SHOW_CUSTOMER_DEVICES", "SET_WAITING_PARTS", "SHOW_OVERDUE"
  ])
});

/** Intents that change state: they NEVER execute without explicit human confirmation. */
const CRITICAL_INTENTS: readonly VoiceIntentKind[] = Object.freeze(["ASSIGN_TECHNICIAN", "SET_WAITING_PARTS"]);

export type VoiceCommandStatus =
  | "EXECUTED_READ"
  | "PENDING_APPROVAL"
  | "VOICE_DENIED"
  | "CAPABILITY_UNAVAILABLE";

export interface VoiceTargetRefs {
  readonly customerId?: string;
  readonly workOrderId?: string;
  readonly technicianId?: string;
}

export interface VoiceCommandOutcome {
  readonly decision: TenantDecision<VoiceCommandStatus>;
  readonly intent: VoiceIntent;
  /** Read results or drafts; plain view data, never records with authority. */
  readonly data?: unknown;
  /** Present when a critical command awaits human confirmation. */
  readonly pendingId?: string;
}

interface PendingCommand {
  readonly id: string;
  readonly sessionId: string;
  readonly intent: VoiceIntent;
  readonly refs: VoiceTargetRefs;
}

export class VoiceCommandService {
  readonly #core: ServiceLumiCore;
  readonly #pending = new Map<string, PendingCommand>();
  #counter = 0;

  constructor(core: ServiceLumiCore) {
    this.#core = core;
  }

  submitTurn(session: AppSession, transcript: string, refs: VoiceTargetRefs, now: string): VoiceCommandOutcome {
    const intake = evaluateVoiceIntake({
      scope: session.scope,
      session: { sessionId: `voice-${session.sessionId}`, mode: "PUSH_TO_TALK", state: "COMPLETE", speakerAssurance: "LOW" as never },
      finalized: true,
      transcript,
      now
    });
    if (intake.decision.decision !== "DRAFT_READY_FOR_HUMAN_CONFIRMATION" || intake.draft === undefined) {
      return this.#denied({ kind: "UNRECOGNIZED" }, session, transcript, now, intake.decision.reasonCode, intake.decision.humanReadableReason);
    }
    // Traceability (EX22.4): record the turn itself, with IMEI/credential redaction.
    this.#audit(session, `voice_turn:${redactForLog(intake.draft.transcript).slice(0, 80)}`, "voice_turn_received", now);
    const intent = parseVoiceIntent(intake.draft.transcript);
    if (intent.kind === "UNRECOGNIZED") {
      return this.#denied(intent, session, transcript, now, "intent_unrecognized", "The command was not recognized; nothing was executed.");
    }
    if (!ROLE_ALLOWED_INTENTS[session.user.role].includes(intent.kind)) {
      return this.#denied(intent, session, transcript, now, "role_not_authorized", `The role '${session.user.role}' is not authorized for this voice command (deny-by-default).`);
    }
    if (intent.kind === "SHOW_CRITICAL_STOCK") {
      this.#audit(session, `voice_command:${intent.kind}:unavailable`, "capability_unavailable", now);
      return {
        decision: decide({
          decision: "CAPABILITY_UNAVAILABLE",
          reasonCode: "stock_module_not_built",
          humanReadableReason: "The inventory/stock module does not exist in the Foundation yet; there is no stock data to show.",
          evaluatedAt: now,
          requiredAction: "Plan the stock module as a later vertical.",
          evidenceRefs: []
        }),
        intent
      };
    }
    if (CRITICAL_INTENTS.includes(intent.kind)) {
      this.#counter += 1;
      const pendingId = `voice-pending-${this.#counter}`;
      this.#pending.set(pendingId, { id: pendingId, sessionId: session.sessionId, intent, refs });
      this.#audit(session, `voice_command:${intent.kind}:pending_approval`, "human_approval_required", now);
      return {
        decision: decide({
          decision: "PENDING_APPROVAL",
          reasonCode: "human_approval_required",
          humanReadableReason: "This voice command changes state; it will only run after explicit human confirmation.",
          evaluatedAt: now,
          requiredAction: "Confirm or reject the pending command in the approval panel.",
          evidenceRefs: [pendingId]
        }),
        intent,
        pendingId
      };
    }
    const data = this.#executeRead(session, intent, refs, now);
    this.#audit(session, `voice_command:${intent.kind}:executed_read`, "voice_read_executed", now);
    return {
      decision: decide({
        decision: "EXECUTED_READ",
        reasonCode: "voice_read_executed",
        humanReadableReason: "The read-only voice command executed within the caller's tenancy scope.",
        evaluatedAt: now,
        requiredAction: "None.",
        evidenceRefs: []
      }),
      intent,
      data
    };
  }

  /** Human confirmation of a pending critical command; only then does state change. */
  confirmPending(session: AppSession, pendingId: string, now: string): VoiceCommandOutcome {
    const pending = this.#pending.get(pendingId);
    if (pending === undefined || pending.sessionId !== session.sessionId) {
      return this.#denied({ kind: "UNRECOGNIZED" }, session, "", now, "pending_not_found", "No pending voice command matches this confirmation (approval is per-session and per-command).");
    }
    this.#pending.delete(pendingId);
    const caller = { scope: session.scope, tenantState: "ACTIVE" as const };
    let reason = "";
    let ok = false;
    if (pending.intent.kind === "ASSIGN_TECHNICIAN" && pending.refs.workOrderId !== undefined && pending.refs.technicianId !== undefined) {
      const result = this.#core.assignTechnician(caller, workOrderId(pending.refs.workOrderId), technicianId(pending.refs.technicianId), now);
      ok = result.decision === "WRITE_ACCEPTED";
      reason = result.reasonCode;
    } else if (pending.intent.kind === "SET_WAITING_PARTS" && pending.refs.workOrderId !== undefined) {
      const result = this.#core.applyWorkOrderTransition(caller, workOrderId(pending.refs.workOrderId), {
        to: "WAITING_PARTS",
        actorId: session.user.id,
        now,
        reasonCode: "voice_confirmed_waiting_parts"
      });
      ok = result.decision === "WRITE_ACCEPTED";
      reason = result.reasonCode;
    } else {
      reason = "pending_refs_incomplete";
    }
    this.#audit(session, `voice_confirm:${pending.intent.kind}:${ok ? "applied" : "denied"}`, reason, now);
    return {
      decision: decide({
        decision: ok ? "EXECUTED_READ" : "VOICE_DENIED",
        reasonCode: reason,
        humanReadableReason: ok
          ? "The confirmed voice command was applied and audited."
          : `The confirmed voice command was denied by the core (${reason}); nothing changed.`,
        evaluatedAt: now,
        requiredAction: ok ? "None." : "Correct the target references and retry.",
        evidenceRefs: [pendingId]
      }),
      intent: pending.intent
    };
  }

  rejectPending(session: AppSession, pendingId: string, now: string): void {
    const pending = this.#pending.get(pendingId);
    if (pending !== undefined && pending.sessionId === session.sessionId) {
      this.#pending.delete(pendingId);
      this.#audit(session, `voice_reject:${pending.intent.kind}`, "human_rejected", now);
    }
  }

  #executeRead(session: AppSession, intent: VoiceIntent, refs: VoiceTargetRefs, now: string): unknown {
    const caller = { scope: session.scope, tenantState: "ACTIVE" as const };
    switch (intent.kind) {
      case "OPEN_INTAKE":
        return { navigateTo: intent.moduleKey === undefined ? "/devices/new" : `/devices/new?module=${intent.moduleKey}` };
      case "SHOW_CUSTOMER_DEVICES": {
        const all = this.#core.listDevices(caller, now);
        const filtered = refs.customerId === undefined ? all : all.filter((d) => d.customerId === customerId(refs.customerId ?? ""));
        return filtered.map((d) => ({ id: d.id as string, label: `${d.brand} ${d.model}`, moduleKey: d.moduleKey as string }));
      }
      case "SHOW_OVERDUE": {
        const today = now.slice(0, 10);
        return this.#core
          .listWorkOrders(caller, now)
          .filter((o) => o.state !== "DELIVERED" && o.state !== "CANCELLED" && o.createdAt.slice(0, 10) < today)
          .map((o) => ({ id: o.id as string, state: o.state, createdAt: o.createdAt }));
      }
      case "DRAFT_QUOTE": {
        const draft: WorkOrderQuote = { amountMinor: 0, currency: "TRY", summary: "" };
        return { workOrderId: refs.workOrderId, draft, note: "Draft only — recording the quote and customer approval stays a human action." };
      }
      case "DRAFT_READY_NOTIFICATION": {
        const order = refs.workOrderId === undefined ? undefined : this.#core.getWorkOrder(caller, workOrderId(refs.workOrderId), now).value;
        const device = order === undefined ? undefined : this.#core.getDevice(caller, deviceId(order.deviceId as string), now).value;
        return {
          draftMessage: `Sayın müşterimiz, ${device === undefined ? "cihazınız" : `${device.brand} ${device.model} cihazınız`} servisimizde teslime hazırdır.`,
          note: "Draft only — no notification gateway exists in the Foundation; nothing is sent."
        };
      }
      default:
        return undefined;
    }
  }

  #denied(intent: VoiceIntent, session: AppSession, transcript: string, now: string, reasonCode: string, reason: string): VoiceCommandOutcome {
    this.#audit(session, `voice_command:${intent.kind}:denied`, reasonCode, now);
    void transcript;
    return {
      decision: decide({
        decision: "VOICE_DENIED",
        reasonCode,
        humanReadableReason: reason,
        evaluatedAt: now,
        requiredAction: "Correct the command and try again.",
        evidenceRefs: []
      }),
      intent
    };
  }

  #audit(session: AppSession, event: string, reasonCode: string, now: string): void {
    this.#core.audit.append({
      scope: session.scope,
      event: redactForLog(event),
      reasonCode: redactForLog(reasonCode),
      recordedAt: now
    });
  }
}
