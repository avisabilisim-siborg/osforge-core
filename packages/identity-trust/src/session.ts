import { elapsedMs, isFuture, isNonEmptyString } from "./internal/crypto.js";
import {
  decide,
  type AssuranceLevel,
  type CredentialId,
  type IdentityDecision,
  type IdentityScope,
  type PrincipalId,
  type SessionId
} from "./types.js";

/**
 * Session foundation (P0.6, §10). Sessions are bound, rotatable, revocable and
 * time-bounded. Fixation, copy and reuse of revoked/expired sessions are denied.
 * Session data never contains secrets.
 */
export type SessionState = "CREATED" | "ACTIVE" | "IDLE" | "STEP_UP_REQUIRED" | "SUSPENDED" | "REVOKED" | "EXPIRED" | "TERMINATED";

export interface Session {
  sessionId: SessionId;
  state: SessionState;
  scope: IdentityScope;
  principalId: PrincipalId;
  credentialId: CredentialId;
  authenticationMethod: string;
  assuranceLevel: AssuranceLevel;
  deviceId?: string;
  runtimeId?: string;
  networkContextRef?: string;
  bindingRef: string;
  issuedAt: string;
  lastVerifiedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  version: number;
}

export type SessionDecisionStatus =
  | "VALID"
  | "NOT_ACTIVE"
  | "REVOKED"
  | "EXPIRED"
  | "IDLE_TIMEOUT"
  | "STEP_UP_REQUIRED"
  | "TENANT_MISMATCH"
  | "COPY_DETECTED";

/** A session verified valid right now. Minted only by `verifySession` (§26). */
export interface ActiveSession {
  readonly __brand: "active_session";
  readonly session: Session;
  readonly verifiedAt: string;
}

export interface VerifySessionInput {
  session: Session | undefined;
  contextScope: IdentityScope;
  expectedBindingRef: string;
  idleTimeoutMs: number;
  now: string;
  privilegeChanged?: boolean;
}

export function verifySession(input: VerifySessionInput): { decision: IdentityDecision<SessionDecisionStatus>; active?: ActiveSession } {
  const s = input.session;
  const base = { evaluatedAt: input.now, evidenceReferences: s ? [String(s.sessionId)] : [] };
  const reject = (decision: SessionDecisionStatus, reasonCode: string, message: string, nextRequiredAction = "halt") => ({
    decision: decide<SessionDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction })
  });

  if (!s || !isNonEmptyString(s.sessionId)) {
    return reject("NOT_ACTIVE", "session_unknown", "Session is unknown.");
  }
  if (s.state === "REVOKED") {
    return reject("REVOKED", "session_revoked", "A revoked session cannot be reused.");
  }
  if (s.state === "EXPIRED" || s.state === "TERMINATED") {
    return reject("EXPIRED", "session_expired", "An expired/terminated session cannot be restored.");
  }
  if (s.state === "SUSPENDED" || s.state === "CREATED") {
    return reject("NOT_ACTIVE", "session_not_active", "Session is not active.");
  }
  // Copy/theft detection: the presented binding must match the session binding.
  if (s.bindingRef !== input.expectedBindingRef) {
    return reject("COPY_DETECTED", "session_copy_detected", "Session binding mismatch (possible copy/theft).");
  }
  if (s.scope.tenantId !== input.contextScope.tenantId || s.scope.workspaceId !== input.contextScope.workspaceId) {
    return reject("TENANT_MISMATCH", "session_tenant_mismatch", "A tenant/workspace change requires a new session.");
  }
  if (!isFuture(s.absoluteExpiresAt, input.now) || !isFuture(s.expiresAt, input.now)) {
    return reject("EXPIRED", "session_absolute_timeout", "Session reached its absolute/expiry timeout.");
  }
  if (elapsedMs(s.lastVerifiedAt, input.now) > input.idleTimeoutMs) {
    return reject("IDLE_TIMEOUT", "session_idle_timeout", "Session exceeded the inactivity timeout.", "re_authenticate");
  }
  if (input.privilegeChanged === true) {
    return reject("STEP_UP_REQUIRED", "privilege_change_reverify", "A privilege change requires re-verification.", "step_up");
  }

  return {
    decision: decide<SessionDecisionStatus>({ ...base, decision: "VALID", reasonCode: "valid", humanReadableReason: "Session is valid.", nextRequiredAction: "continue", expiresAt: s.expiresAt }),
    active: Object.freeze({ __brand: "active_session", session: s, verifiedAt: input.now })
  };
}

/** Reference in-memory session store (test only). Rejects session fixation. */
export class InMemorySessionStore {
  readonly testOnly = true;
  readonly productionReady = false;
  readonly #sessions = new Map<string, Session>();

  create(session: Session): { ok: boolean; reasonCode: string } {
    if (this.#sessions.has(String(session.sessionId))) {
      return { ok: false, reasonCode: "session_fixation_denied" };
    }
    this.#sessions.set(String(session.sessionId), Object.freeze({ ...session }));
    return { ok: true, reasonCode: "created" };
  }

  get(id: SessionId): Session | undefined {
    return this.#sessions.get(String(id));
  }

  /** Rotation issues a NEW session id and revokes the old one (anti-fixation). */
  rotate(oldId: SessionId, next: Session): { ok: boolean; reasonCode: string } {
    const old = this.#sessions.get(String(oldId));
    if (!old) {
      return { ok: false, reasonCode: "session_unknown" };
    }
    if (String(next.sessionId) === String(oldId)) {
      return { ok: false, reasonCode: "rotation_requires_new_id" };
    }
    this.#sessions.set(String(oldId), Object.freeze({ ...old, state: "TERMINATED" }));
    return this.create(next);
  }

  revoke(id: SessionId): void {
    const s = this.#sessions.get(String(id));
    if (s) {
      this.#sessions.set(String(id), Object.freeze({ ...s, state: "REVOKED" }));
    }
  }
}
