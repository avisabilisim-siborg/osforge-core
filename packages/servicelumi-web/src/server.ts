/**
 * ServiceLumi web server — zero-dependency (node:http) server-rendered app for
 * the local vertical slice. Every request resolves a development session, and
 * every domain effect goes through the governed `ServiceLumiCore` typed
 * contracts; the UI never touches storage directly. This server is a
 * development surface: production traffic enters through the full OSForge
 * security chain (S4.1), never through this shell.
 */

/// <reference path="./internal/node-http.d.ts" />
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { ServiceLumiApp } from "../../servicelumi-app/src/index.js";
import type { AppSession } from "../../servicelumi-app/src/index.js";
import { DEMO_TENANTS, DEMO_USERS } from "../../servicelumi-app/src/index.js";
import {
  SERVICE_MODULE_KEYS,
  customerApprovalRef,
  customerId,
  deviceId,
  isServiceModuleKey,
  legalNextStates,
  maskIdentifier,
  technicianId,
  workOrderId
} from "../../servicelumi-core/src/index.js";
import type { CoreCaller, DeviceAttributeValue, ServiceModuleKey, WorkOrderState } from "../../servicelumi-core/src/index.js";
import { BOARD_COLUMNS, OfflineSyncGate, technicianTaskView, workOrderBoardView } from "../../servicelumi-surface/src/index.js";
import type { OfflineOperation } from "../../servicelumi-surface/src/index.js";
import { esc, jsonForScript, page, stateChip } from "./html.js";
import type { PageContext } from "./html.js";
import { t } from "./i18n.js";
import type { Locale } from "./i18n.js";

function nowIso(): string {
  return new Date().toISOString();
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk.toString("utf8");
      if (data.length > 1_000_000) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function cookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

function redirect(res: ServerResponse, to: string, setCookie?: string): void {
  const headers: Record<string, string | string[]> = { Location: to };
  if (setCookie !== undefined) {
    headers["Set-Cookie"] = setCookie;
  }
  res.writeHead(303, headers);
  res.end();
}

function sendHtml(res: ServerResponse, html: string, status = 200): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(html);
}

function sendJson(res: ServerResponse, value: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function ctxOf(session: AppSession): PageContext {
  const tenant = DEMO_TENANTS.find((x) => x.scope.tenantId === session.scope.tenantId);
  return {
    locale: session.locale,
    theme: session.theme,
    userLabel: session.user.displayName,
    tenantLabel: tenant?.label ?? (session.scope.tenantId as string)
  };
}

function callerOf(session: AppSession): CoreCaller {
  return { scope: session.scope, tenantState: "ACTIVE" };
}

/** Attribute names whose values are masked on every screen (PV24.3). */
const MASKED_ATTRIBUTES: readonly string[] = Object.freeze(["imei", "imei2"]);

function attributeDisplay(name: string, value: DeviceAttributeValue): string {
  if (typeof value === "string" && MASKED_ATTRIBUTES.includes(name)) {
    return maskIdentifier(value);
  }
  return String(value);
}

export interface RunningWeb {
  readonly server: Server;
  readonly port: number;
  readonly app: ServiceLumiApp;
  close(): Promise<void>;
}

export function createServiceLumiWeb(app: ServiceLumiApp): Server {
  const syncGate = new OfflineSyncGate();

  return createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "unexpected error";
      sendHtml(res, `<h1>500</h1><p>${esc(message)}</p>`, 500);
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const session = app.sessions.get(cookies(req)["sid"]);
    const now = nowIso();

    // ---- unauthenticated routes ----
    if (path === "/login") {
      if (req.method === "POST") {
        const form = new URLSearchParams(await readBody(req));
        const tenant = DEMO_TENANTS.find((x) => (x.scope.tenantId as string) === form.get("tenant"));
        const locale: Locale = form.get("locale") === "en" ? "en" : "tr";
        const theme = form.get("theme") === "light" ? "light" : "dark";
        const opened = tenant === undefined ? undefined : app.sessions.open(form.get("user") ?? "", tenant.scope, locale, theme);
        if (opened === undefined) {
          redirect(res, "/login");
          return;
        }
        redirect(res, "/dashboard", `sid=${opened.sessionId}; HttpOnly; Path=/; SameSite=Lax`);
        return;
      }
      sendHtml(res, loginView());
      return;
    }
    if (session === undefined) {
      redirect(res, "/login");
      return;
    }
    if (path === "/logout" && req.method === "POST") {
      app.sessions.close(session.sessionId);
      redirect(res, "/login", "sid=; Max-Age=0; Path=/");
      return;
    }

    const caller = callerOf(session);
    const ctx = ctxOf(session);
    const L = (key: string) => t(session.locale, key);

    // ---- GET screens ----
    if (req.method === "GET") {
      if (path === "/" || path === "/dashboard") {
        sendHtml(res, dashboardView(session, ctx));
        return;
      }
      if (path === "/customers") {
        const rows = app.core.listCustomers(caller, now).map((c) =>
          `<tr><td><a href="/customers/${esc(c.id as string)}">${esc(c.fullName)}</a></td><td>${esc(c.phone ?? "—")}</td><td>${esc(c.createdAt.slice(0, 10))}</td></tr>`
        ).join("");
        sendHtml(res, page({ ...ctx, activeNav: "/customers" }, L("customers"), `
          <h1>${esc(L("customers"))}</h1>
          <div class="actionsrow"><a class="btn" href="/customers/new">+ ${esc(L("newCustomer"))}</a></div>
          <table><thead><tr><th>${esc(L("fullName"))}</th><th>${esc(L("phone"))}</th><th>—</th></tr></thead>
          <tbody>${rows === "" ? `<tr><td colspan="3">${esc(L("none"))}</td></tr>` : rows}</tbody></table>`));
        return;
      }
      if (path === "/customers/new") {
        sendHtml(res, page({ ...ctx, activeNav: "/customers" }, L("newCustomer"), `
          <h1>${esc(L("newCustomer"))}</h1>
          <form class="stack card" method="post" action="/customers/new">
            <label>${esc(L("fullName"))}<input name="fullName" required></label>
            <label>${esc(L("phone"))}<input name="phone"></label>
            <label>${esc(L("email"))}<input name="email" type="email"></label>
            <label>${esc(L("note"))}<textarea name="note" rows="2"></textarea></label>
            <button type="submit">${esc(L("save"))}</button>
          </form>`));
        return;
      }
      const customerMatch = /^\/customers\/([^/]+)$/u.exec(path);
      if (customerMatch !== null) {
        const record = app.core.getCustomer(caller, customerId(customerMatch[1]), now);
        if (record.value === undefined) {
          sendHtml(res, page(ctx, "404", `<h1>404</h1><p class="muted">${esc(record.decision.humanReadableReason)}</p>`), 404);
          return;
        }
        const devices = app.core.listDevices(caller, now).filter((d) => d.customerId === record.value?.id);
        sendHtml(res, page({ ...ctx, activeNav: "/customers" }, L("customerDetail"), `
          <h1>${esc(record.value.fullName)}</h1>
          <div class="card"><p>${esc(L("phone"))}: ${esc(record.value.phone ?? "—")} · ${esc(L("email"))}: ${esc(record.value.email ?? "—")}</p></div>
          <h2>${esc(L("devices"))} (${esc(L("passport"))})</h2>
          <table><thead><tr><th>${esc(L("device"))}</th><th>${esc(L("module"))}</th><th>${esc(L("serialNumber"))}</th></tr></thead><tbody>
          ${devices.length === 0 ? `<tr><td colspan="3">${esc(L("none"))}</td></tr>` : devices.map((d) =>
            `<tr><td>${esc(d.brand)} ${esc(d.model)}</td><td>${esc(d.moduleKey as string)}</td><td>${esc(d.serialNumber ?? "—")}</td></tr>`).join("")}
          </tbody></table>
          <div class="actionsrow"><a class="btn" href="/devices/new">+ ${esc(L("newDevice"))}</a></div>`));
        return;
      }
      if (path === "/devices") {
        const rows = app.core.listDevices(caller, now).map((d) => {
          const masked = Object.entries(d.attributes)
            .map(([k, v]) => `${esc(k)}: ${esc(attributeDisplay(k, v))}`)
            .join(" · ");
          return `<tr><td>${esc(d.brand)} ${esc(d.model)}</td><td>${esc(d.moduleKey as string)}</td><td class="muted">${masked}</td></tr>`;
        }).join("");
        sendHtml(res, page({ ...ctx, activeNav: "/devices" }, L("devices"), `
          <h1>${esc(L("devices"))}</h1>
          <div class="actionsrow"><a class="btn" href="/devices/new">+ ${esc(L("newDevice"))}</a></div>
          <table><thead><tr><th>${esc(L("device"))}</th><th>${esc(L("module"))}</th><th>—</th></tr></thead>
          <tbody>${rows === "" ? `<tr><td colspan="3">${esc(L("none"))}</td></tr>` : rows}</tbody></table>`));
        return;
      }
      if (path === "/devices/new") {
        sendHtml(res, deviceNewView(session, ctx, url.searchParams));
        return;
      }
      if (path === "/orders") {
        const rows = app.core.listWorkOrders(caller, now).map((o) =>
          `<tr><td><a href="/orders/${esc(o.id as string)}">${esc(o.id as string)}</a></td><td>${stateChip(o.state)}</td><td>${esc(o.moduleKey as string)}</td><td>${esc(o.reportedProblem)}</td></tr>`
        ).join("");
        sendHtml(res, page({ ...ctx, activeNav: "/orders" }, L("orders"), `
          <h1>${esc(L("orders"))}</h1>
          <div class="actionsrow"><a class="btn" href="/orders/new">+ ${esc(L("newOrder"))}</a></div>
          <table><thead><tr><th>ID</th><th>${esc(L("state"))}</th><th>${esc(L("module"))}</th><th>${esc(L("reportedProblem"))}</th></tr></thead>
          <tbody>${rows === "" ? `<tr><td colspan="4">${esc(L("none"))}</td></tr>` : rows}</tbody></table>`));
        return;
      }
      if (path === "/orders/new") {
        const customers = app.core.listCustomers(caller, now);
        const devices = app.core.listDevices(caller, now);
        sendHtml(res, page({ ...ctx, activeNav: "/orders" }, L("newOrder"), `
          <h1>${esc(L("newOrder"))}</h1>
          <form class="stack card" method="post" action="/orders/new">
            <label>${esc(L("customer"))}<select name="customerId" required>${customers.map((c) =>
              `<option value="${esc(c.id as string)}">${esc(c.fullName)}</option>`).join("")}</select></label>
            <label>${esc(L("device"))}<select name="deviceId" required>${devices.map((d) =>
              `<option value="${esc(d.id as string)}">${esc(d.brand)} ${esc(d.model)} (${esc(d.moduleKey as string)})</option>`).join("")}</select></label>
            <label>${esc(L("reportedProblem"))}<textarea name="reportedProblem" rows="3" required></textarea></label>
            <button type="submit">${esc(L("save"))}</button>
          </form>`));
        return;
      }
      if (path === "/board") {
        const board = workOrderBoardView(app.core.listWorkOrders(caller, now));
        sendHtml(res, page({ ...ctx, activeNav: "/board" }, L("board"), `
          <h1>${esc(L("board"))}</h1>
          <div class="board">${board.columns.map((col) => `
            <section class="col"><h3>${esc(col.state)} (${col.cards.length})</h3>
            ${col.cards.map((c) => `<a class="kcard" href="/orders/${esc(c.workOrderId)}">${esc(c.workOrderId)}<br><span class="muted">${esc(c.reportedProblem.slice(0, 60))}</span></a>`).join("")}
            </section>`).join("")}</div>`));
        return;
      }
      const orderMatch = /^\/orders\/([^/]+)$/u.exec(path);
      if (orderMatch !== null) {
        const visible = app.core.getWorkOrder(caller, workOrderId(orderMatch[1]), now).value !== undefined;
        sendHtml(res, orderDetailView(session, ctx, orderMatch[1]), visible ? 200 : 404);
        return;
      }
      if (path === "/audit") {
        const entries = app.core.audit.entries(session.scope);
        sendHtml(res, page({ ...ctx, activeNav: "/audit" }, L("auditLog"), `
          <h1>${esc(L("auditLog"))}</h1>
          <p class="muted">verify(chain) = ${app.core.audit.verify(session.scope) ? "OK" : "BROKEN"}</p>
          <table><thead><tr><th>#</th><th>event</th><th>reason</th><th>at</th></tr></thead><tbody>
          ${entries.length === 0 ? `<tr><td colspan="4">${esc(L("none"))}</td></tr>` : [...entries].reverse().map((e) =>
            `<tr><td>${e.sequence}</td><td>${esc(e.event)}</td><td class="muted">${esc(e.reasonCode)}</td><td class="muted">${esc(e.recordedAt)}</td></tr>`).join("")}
          </tbody></table>`));
        return;
      }
      if (path === "/modules") {
        sendHtml(res, page({ ...ctx, activeNav: "/modules" }, L("modules"), `
          <h1>${esc(L("modules"))}</h1>
          <div class="grid">${SERVICE_MODULE_KEYS.map((key) => {
            const def = app.core.registry.definition(key);
            const enabled = app.core.registry.isEnabled(session.scope, key);
            return `<div class="card"><h2>${esc(def?.displayName ?? key)}</h2>
              <p>${enabled ? `<span class="chip st-APPROVED">${esc(L("enabled"))}</span>` : `<span class="chip st-CANCELLED">${esc(L("disabled"))}</span>`}</p>
              <form method="post" action="/modules/toggle" class="actionsrow">
                <input type="hidden" name="key" value="${esc(key)}">
                <input type="hidden" name="action" value="${enabled ? "disable" : "enable"}">
                <button type="submit" class="${enabled ? "danger" : ""}">${esc(enabled ? L("disable") : L("enable"))}</button>
              </form></div>`;
          }).join("")}</div>`));
        return;
      }
      if (path === "/voice") {
        sendHtml(res, voiceView(session, ctx, undefined));
        return;
      }
      if (path === "/ocr") {
        sendHtml(res, ocrView(session, ctx, undefined, undefined));
        return;
      }
      if (path === "/mobile") {
        sendHtml(res, mobileView(session, ctx));
        return;
      }
    }

    // ---- POST actions ----
    if (req.method === "POST") {
      const form = new URLSearchParams(await readBody(req));
      if (path === "/customers/new") {
        app.core.createCustomer(caller, {
          id: customerId(`cust-${Date.now().toString(36)}`),
          scope: session.scope,
          fullName: form.get("fullName") ?? "",
          ...(nz(form.get("phone")) !== undefined ? { phone: nz(form.get("phone")) } : {}),
          ...(nz(form.get("email")) !== undefined ? { email: nz(form.get("email")) } : {}),
          ...(nz(form.get("note")) !== undefined ? { note: nz(form.get("note")) } : {}),
          createdAt: now
        }, now);
        redirect(res, "/customers");
        return;
      }
      if (path === "/devices/new") {
        const moduleKeyRaw = form.get("moduleKey") ?? "";
        if (!isServiceModuleKey(moduleKeyRaw)) {
          redirect(res, "/devices/new");
          return;
        }
        const def = app.core.registry.definition(moduleKeyRaw);
        const attributes: Record<string, DeviceAttributeValue> = {};
        for (const spec of def?.deviceAttributes ?? []) {
          const raw = form.get(`attr_${spec.name}`);
          if (spec.kind === "boolean") {
            attributes[spec.name] = raw === "on";
          } else if (raw !== null && raw !== "") {
            attributes[spec.name] = spec.kind === "number" ? Number(raw) : raw;
          }
        }
        const decision = app.core.registerDevice(caller, {
          id: deviceId(`dev-${Date.now().toString(36)}`),
          scope: session.scope,
          customerId: customerId(form.get("customerId") ?? ""),
          moduleKey: moduleKeyRaw,
          brand: form.get("brand") ?? "",
          model: form.get("model") ?? "",
          ...(nz(form.get("serialNumber")) !== undefined ? { serialNumber: nz(form.get("serialNumber")) } : {}),
          attributes,
          createdAt: now
        }, now);
        if (decision.decision !== "WRITE_ACCEPTED") {
          sendHtml(res, page(ctx, L("newDevice"), `<div class="notice err">${esc(decision.humanReadableReason)}</div><a class="btn secondary" href="/devices/new?module=${esc(moduleKeyRaw)}">← ${esc(L("cancel"))}</a>`));
          return;
        }
        redirect(res, "/devices");
        return;
      }
      if (path === "/orders/new") {
        const decision = app.core.openWorkOrder(caller, {
          id: workOrderId(`wo-${Date.now().toString(36)}`),
          customerId: customerId(form.get("customerId") ?? ""),
          deviceId: deviceId(form.get("deviceId") ?? ""),
          reportedProblem: form.get("reportedProblem") ?? ""
        }, now);
        if (decision.decision !== "WRITE_ACCEPTED") {
          sendHtml(res, page(ctx, L("newOrder"), `<div class="notice err">${esc(decision.humanReadableReason)}</div><a class="btn secondary" href="/orders/new">←</a>`));
          return;
        }
        redirect(res, "/orders");
        return;
      }
      const actMatch = /^\/orders\/([^/]+)\/act$/u.exec(path);
      if (actMatch !== null) {
        handleOrderAction(session, actMatch[1], form, now, res, ctx);
        return;
      }
      if (path === "/modules/toggle") {
        const key = form.get("key") ?? "";
        if (isServiceModuleKey(key)) {
          if (form.get("action") === "enable") {
            app.core.enableModule(caller, key, now);
          } else {
            app.core.disableModule(caller, key, now);
          }
        }
        redirect(res, "/modules");
        return;
      }
      if (path === "/voice/turn") {
        const outcome = app.voice.submitTurn(session, form.get("transcript") ?? "", {
          ...(nz(form.get("customerId")) !== undefined ? { customerId: nz(form.get("customerId")) } : {}),
          ...(nz(form.get("workOrderId")) !== undefined ? { workOrderId: nz(form.get("workOrderId")) } : {}),
          ...(nz(form.get("technicianId")) !== undefined ? { technicianId: nz(form.get("technicianId")) } : {})
        }, now);
        sendHtml(res, voiceView(session, ctx, outcome));
        return;
      }
      if (path === "/voice/confirm") {
        const outcome = app.voice.confirmPending(session, form.get("pendingId") ?? "", now);
        sendHtml(res, voiceView(session, ctx, outcome));
        return;
      }
      if (path === "/voice/reject") {
        app.voice.rejectPending(session, form.get("pendingId") ?? "", now);
        redirect(res, "/voice");
        return;
      }
      if (path === "/ocr/scan") {
        const result = await app.ocr.scanLabel(session, form.get("fileName") ?? "", Number(form.get("sizeBytes") ?? "0"), now);
        sendHtml(res, ocrView(session, ctx, result, undefined));
        return;
      }
      if (path === "/ocr/confirm") {
        const confirmed = app.ocr.confirmDraft(session, form.get("draftId") ?? "", {
          ...(nz(form.get("brand")) !== undefined ? { brand: nz(form.get("brand")) } : {}),
          ...(nz(form.get("model")) !== undefined ? { model: nz(form.get("model")) } : {}),
          ...(nz(form.get("serialNumber")) !== undefined ? { serialNumber: nz(form.get("serialNumber")) } : {})
        }, now);
        sendHtml(res, ocrView(session, ctx, undefined, confirmed));
        return;
      }
      if (path === "/mobile/sync") {
        let envelope: { operations?: readonly { idempotencyKey?: string; tenantId?: string; organizationId?: string; workspaceId?: string; kind?: string; workOrderId?: string; to?: string }[] };
        try {
          envelope = JSON.parse(form.get("envelope") ?? "{}") as typeof envelope;
        } catch {
          sendJson(res, { error: "invalid envelope json" }, 400);
          return;
        }
        const operations: OfflineOperation[] = (envelope.operations ?? []).map((op, i) => ({
          idempotencyKey: op.idempotencyKey ?? `missing-${i}`,
          scope: {
            tenantId: (op.tenantId ?? "") as never,
            organizationId: (op.organizationId ?? "") as never,
            workspaceId: (op.workspaceId ?? "") as never
          },
          kind: (op.kind === "work_order_transition" ? "work_order_transition" : "diagnosis_note"),
          queuedAt: now
        }));
        const evaluation = syncGate.evaluate({ scope: session.scope, operations, preparedAt: now }, now);
        const applied: string[] = [];
        if (evaluation.decision.decision === "ENVELOPE_ACCEPTED") {
          for (const [i, op] of operations.entries()) {
            if (!evaluation.accepted.includes(op)) {
              continue;
            }
            const raw = (envelope.operations ?? [])[i];
            if (op.kind === "work_order_transition" && raw?.workOrderId !== undefined && raw.to !== undefined) {
              const result = app.core.applyWorkOrderTransition(caller, workOrderId(raw.workOrderId), {
                to: raw.to as WorkOrderState,
                actorId: session.user.id,
                now,
                reasonCode: "mobile_offline_sync"
              });
              applied.push(`${op.idempotencyKey}:${result.decision}:${result.reasonCode}`);
            }
          }
        }
        sendJson(res, { decision: evaluation.decision, duplicates: evaluation.duplicates, applied });
        return;
      }
    }

    sendHtml(res, page(ctx, "404", `<h1>404</h1><p class="muted">${esc(path)}</p>`), 404);
  }

  // ---------- views needing app state ----------

  function nz(value: string | null): string | undefined {
    return value === null || value.trim() === "" ? undefined : value;
  }

  function loginView(): string {
    const ctx: PageContext = { locale: "tr", theme: "dark" };
    return page(ctx, t("tr", "loginTitle"), `
      <h1>${esc(t("tr", "loginTitle"))}</h1>
      <div class="notice warn">${esc(t("tr", "loginHint"))}</div>
      <form class="stack card" method="post" action="/login">
        <label>${esc(t("tr", "user"))}<select name="user">${DEMO_USERS.map((u) =>
          `<option value="${esc(u.id as string)}">${esc(u.displayName)} — ${esc(u.role)}</option>`).join("")}</select></label>
        <label>${esc(t("tr", "tenant"))}<select name="tenant">${DEMO_TENANTS.map((x) =>
          `<option value="${esc(x.scope.tenantId as string)}">${esc(x.label)}</option>`).join("")}</select></label>
        <label>${esc(t("tr", "language"))}<select name="locale"><option value="tr">Türkçe</option><option value="en">English</option></select></label>
        <label>${esc(t("tr", "theme"))}<select name="theme"><option value="dark">${esc(t("tr", "dark"))}</option><option value="light">${esc(t("tr", "light"))}</option></select></label>
        <button type="submit">${esc(t("tr", "signIn"))}</button>
      </form>`);
  }

  function dashboardView(session: AppSession, ctx: PageContext): string {
    const caller = callerOf(session);
    const now = nowIso();
    const L = (key: string) => t(session.locale, key);
    const orders = app.core.listWorkOrders(caller, now);
    const open = orders.filter((o) => o.state !== "DELIVERED" && o.state !== "CANCELLED");
    return page({ ...ctx, activeNav: "/dashboard" }, L("dashboard"), `
      <h1>${esc(L("welcome"))} — ${esc(session.user.displayName)}</h1>
      <div class="grid">
        <div class="card"><div class="stat">${app.core.listCustomers(caller, now).length}</div>${esc(L("totalCustomers"))}</div>
        <div class="card"><div class="stat">${app.core.listDevices(caller, now).length}</div>${esc(L("totalDevices"))}</div>
        <div class="card"><div class="stat">${open.length}</div>${esc(L("openOrders"))}</div>
      </div>
      <h2>${esc(L("orders"))}</h2>
      <table><thead><tr><th>ID</th><th>${esc(L("state"))}</th><th>${esc(L("reportedProblem"))}</th></tr></thead><tbody>
      ${open.slice(0, 8).map((o) => `<tr><td><a href="/orders/${esc(o.id as string)}">${esc(o.id as string)}</a></td><td>${stateChip(o.state)}</td><td>${esc(o.reportedProblem)}</td></tr>`).join("") || `<tr><td colspan="3">${esc(L("none"))}</td></tr>`}
      </tbody></table>`);
  }

  function deviceNewView(session: AppSession, ctx: PageContext, params: URLSearchParams): string {
    const caller = callerOf(session);
    const now = nowIso();
    const L = (key: string) => t(session.locale, key);
    const chosen = params.get("module") ?? "";
    if (!isServiceModuleKey(chosen)) {
      return page({ ...ctx, activeNav: "/devices" }, L("chooseModule"), `
        <h1>${esc(L("chooseModule"))}</h1>
        <div class="grid">${SERVICE_MODULE_KEYS.map((key) => {
          const def = app.core.registry.definition(key);
          const enabled = app.core.registry.isEnabled(session.scope, key);
          return `<div class="card"><h2>${esc(def?.displayName ?? key)}</h2>
            ${enabled ? `<a class="btn" href="/devices/new?module=${esc(key)}">${esc(L("newDevice"))}</a>` : `<span class="chip st-CANCELLED">${esc(L("disabled"))}</span>`}
          </div>`;
        }).join("")}</div>`);
    }
    const def = app.core.registry.definition(chosen);
    const customers = app.core.listCustomers(caller, now);
    const prefillBrand = params.get("brand") ?? "";
    const prefillModel = params.get("model") ?? "";
    const prefillSerial = params.get("serial") ?? "";
    return page({ ...ctx, activeNav: "/devices" }, L("newDevice"), `
      <h1>${esc(def?.displayName ?? chosen)} — ${esc(L("newDevice"))}</h1>
      <div class="notice">${esc((def?.intakeChecklist ?? []).join(" • "))}</div>
      <form class="stack card" method="post" action="/devices/new">
        <input type="hidden" name="moduleKey" value="${esc(chosen)}">
        <label>${esc(L("customer"))}<select name="customerId" required>${customers.map((c) =>
          `<option value="${esc(c.id as string)}">${esc(c.fullName)}</option>`).join("")}</select></label>
        <label>${esc(L("brand"))}<input name="brand" required value="${esc(prefillBrand)}"></label>
        <label>${esc(L("model"))}<input name="model" required value="${esc(prefillModel)}"></label>
        <label>${esc(L("serialNumber"))}<input name="serialNumber" value="${esc(prefillSerial)}"></label>
        ${(def?.deviceAttributes ?? []).map((spec) => {
          const req = spec.required ? " required" : "";
          if (spec.kind === "boolean") {
            return `<label>${esc(spec.name)}<input type="checkbox" name="attr_${esc(spec.name)}"></label>`;
          }
          if (spec.kind === "enum") {
            return `<label>${esc(spec.name)}<select name="attr_${esc(spec.name)}"${req}>${(spec.enumValues ?? []).map((v) => `<option>${esc(v)}</option>`).join("")}</select></label>`;
          }
          return `<label>${esc(spec.name)}<input name="attr_${esc(spec.name)}" type="${spec.kind === "number" ? "number" : "text"}" step="any"${req}></label>`;
        }).join("")}
        <button type="submit">${esc(L("save"))}</button>
      </form>`);
  }

  function orderDetailView(session: AppSession, ctx: PageContext, id: string): string {
    const caller = callerOf(session);
    const now = nowIso();
    const L = (key: string) => t(session.locale, key);
    const read = app.core.getWorkOrder(caller, workOrderId(id), now);
    if (read.value === undefined) {
      return page(ctx, "404", `<h1>404</h1><p class="muted">${esc(read.decision.humanReadableReason)}</p>`);
    }
    const o = read.value;
    const def = app.core.registry.definition(o.moduleKey);
    const device = app.core.getDevice(caller, o.deviceId, now).value;
    const customer = app.core.getCustomer(caller, o.customerId, now).value;
    const technicians = app.core.listTechnicians(caller, now);
    const next = legalNextStates(o.state);
    const act = (action: string, label: string, extra = "", cls = "") =>
      `<form method="post" action="/orders/${esc(id)}/act" class="actionsrow"><input type="hidden" name="action" value="${action}">${extra}<button type="submit" class="${cls}">${esc(label)}</button></form>`;
    return page({ ...ctx, activeNav: "/orders" }, L("orderDetail"), `
      <h1>${esc(id)} ${stateChip(o.state)}</h1>
      <div class="grid">
        <div class="card">
          <h2>${esc(L("customer"))} / ${esc(L("device"))}</h2>
          <p>${esc(customer?.fullName ?? "—")}</p>
          <p>${esc(device?.brand ?? "")} ${esc(device?.model ?? "")} <span class="muted">${esc(device?.serialNumber ?? "")}</span></p>
          <p class="muted">${esc(L("reportedProblem"))}: ${esc(o.reportedProblem)}</p>
          <p class="muted">${esc(L("technician"))}: ${esc((o.assignedTechnicianId as string | undefined) ?? "—")}</p>
        </div>
        <div class="card">
          <h2>${esc(L("quote"))} / ${esc(L("warranty"))}</h2>
          <p>${o.quote === undefined ? esc(L("none")) : `${esc(o.quote.summary)} — <b>${o.quote.amountMinor / 100} ${esc(o.quote.currency)}</b>`}</p>
          <p>${esc(L("customerApproval"))}: ${o.customerApproval === undefined ? "—" : `<span class="chip st-APPROVED">${esc(o.customerApproval as string)}</span>`}</p>
          <p>${esc(L("warranty"))}: ${o.warranty === undefined ? "—" : `${o.warranty.months} ay · ${esc(o.warranty.terms)}`}</p>
        </div>
      </div>
      <h2>${esc(L("actions"))}</h2>
      <div class="card">
        ${next.includes("DIAGNOSING") ? act("diagnose", L("diagnosis"), `
          <label>${esc(L("faultCodes"))}<select name="fault">${(def?.faultTaxonomy ?? []).map((f) => `<option value="${esc(f.code)}">${esc(f.label)}</option>`).join("")}</select></label>
          <label>${esc(L("diagnosisNote"))}<input name="note"></label>`) : ""}
        ${next.includes("QUOTE_PENDING_APPROVAL") ? act("quote", L("recordQuote"), `
          <label>${esc(L("quoteSummary"))}<input name="summary" required></label>
          <label>${esc(L("amount"))}<input name="amount" type="number" min="0" required></label>`) : ""}
        ${next.includes("APPROVED") ? act("approve", L("recordApproval"), `
          <label>${esc(L("approvalRef"))}<input name="approvalRef" required></label>`) : ""}
        ${next.includes("IN_REPAIR") && o.state !== "TESTING" && o.state !== "WAITING_PARTS" ? act("start", L("startRepair")) : ""}
        ${next.includes("WAITING_PARTS") ? act("waitparts", L("waitingParts"), "", "secondary") : ""}
        ${o.state === "WAITING_PARTS" ? act("resume", L("resumeRepair")) : ""}
        ${next.includes("TESTING") && o.state === "IN_REPAIR" ? act("totest", L("toTesting")) : ""}
        ${o.state === "TESTING" && next.includes("IN_REPAIR") ? act("resume", L("resumeRepair"), "", "secondary") : ""}
        ${next.includes("READY_FOR_PICKUP") ? act("ready", L("readyForPickup")) : ""}
        ${next.includes("DELIVERED") ? act("deliver", L("deliver"), `
          <label>${esc(L("warrantyMonths"))}<input name="months" type="number" min="0" value="6" required></label>
          <label>${esc(L("warrantyTerms"))}<input name="terms" value="Parça ve işçilik garantisi" required></label>
          <label>${esc(L("signatureRef"))}<input name="signatureRef"></label>`) : ""}
        ${o.state !== "DELIVERED" && o.state !== "CANCELLED" ? act("cancel", L("cancel"), "", "danger") : ""}
      </div>
      <div class="grid">
        <div class="card"><h2>${esc(L("assignTechnician"))}</h2>
          ${act("assign", L("assignTechnician"), `<label>${esc(L("technician"))}<select name="technicianId">${technicians.map((x) =>
            `<option value="${esc(x.id as string)}">${esc(x.displayName)} [${esc(x.certifications.join(",") || "-")}]</option>`).join("")}</select></label>`)}
        </div>
        <div class="card"><h2>${esc(L("partUsed"))}</h2>
          ${act("part", L("addPart"), `
            <label>${esc(L("partCode"))}<input name="partCode" required></label>
            <label>${esc(L("description"))}<input name="partDesc" required></label>`)}
          <ul>${o.partsUsed.map((p) => `<li>${esc(p.partCode)} — ${esc(p.description)}</li>`).join("") || `<li class="muted">${esc(L("none"))}</li>`}</ul>
        </div>
        <div class="card"><h2>${esc(L("qualityChecklist"))}</h2>
          ${(def?.qualityChecklist ?? []).map((item) => {
            const done = o.qualityChecks.some((q) => q.item === item && q.passed);
            return done
              ? `<p><span class="chip st-APPROVED">✓</span> ${esc(item)}</p>`
              : act("qc", `${L("markPassed")}: ${item.slice(0, 30)}`, `<input type="hidden" name="qcItem" value="${esc(item)}">`, "secondary");
          }).join("")}
        </div>
        <div class="card"><h2>${esc(L("photos"))}</h2>
          ${act("photo", L("addPhotoRef"), `<label><input name="photoRef" placeholder="photo-ref-1" required></label>`, "secondary")}
          <ul>${o.photoRefs.map((p) => `<li>${esc(p)}</li>`).join("") || `<li class="muted">${esc(L("none"))}</li>`}</ul>
        </div>
      </div>
      <h2>${esc(L("serviceTimeline"))}</h2>
      <ul class="timeline">
        <li>${esc(o.createdAt)} — RECEIVED</li>
        ${o.history.map((h) => `<li>${esc(h.at)} — ${esc(h.from)} → <b>${esc(h.to)}</b> <span class="muted">(${esc(h.reasonCode)}, ${esc(h.actorId as string)})</span></li>`).join("")}
      </ul>`);
  }

  function handleOrderAction(session: AppSession, id: string, form: URLSearchParams, now: string, res: ServerResponse, ctx: PageContext): void {
    const caller = callerOf(session);
    const oid = workOrderId(id);
    const action = form.get("action") ?? "";
    const actor = session.user.id;
    const tr = (to: WorkOrderState, extra: Partial<Parameters<typeof app.core.applyWorkOrderTransition>[2]> = {}) =>
      app.core.applyWorkOrderTransition(caller, oid, { to, actorId: actor, now, reasonCode: `ui_${action}`, ...extra });
    let decision;
    switch (action) {
      case "diagnose": {
        const fault = form.get("fault");
        decision = tr("DIAGNOSING", {
          ...(fault !== null ? { faultCodes: [fault] } : {}),
          ...(form.get("note") !== null && form.get("note") !== "" ? { diagnosisNote: form.get("note") ?? "" } : {})
        });
        break;
      }
      case "quote":
        decision = tr("QUOTE_PENDING_APPROVAL", {
          quote: { amountMinor: Number(form.get("amount") ?? "0"), currency: "TRY", summary: form.get("summary") ?? "" }
        });
        break;
      case "approve":
        decision = tr("APPROVED", { customerApproval: customerApprovalRef(form.get("approvalRef") ?? "") });
        break;
      case "start":
        decision = tr("IN_REPAIR");
        break;
      case "waitparts":
        decision = tr("WAITING_PARTS");
        break;
      case "resume":
        decision = tr("IN_REPAIR");
        break;
      case "totest":
        decision = tr("TESTING");
        break;
      case "ready":
        decision = tr("READY_FOR_PICKUP");
        break;
      case "cancel":
        decision = tr("CANCELLED");
        break;
      case "assign":
        decision = app.core.assignTechnician(caller, oid, technicianId(form.get("technicianId") ?? ""), now);
        break;
      case "part":
        decision = app.core.recordPartUsed(caller, oid, {
          partCode: form.get("partCode") ?? "",
          description: form.get("partDesc") ?? "",
          recordedAt: now
        }, now);
        break;
      case "qc":
        decision = app.core.recordQualityCheck(caller, oid, {
          item: form.get("qcItem") ?? "",
          passed: true,
          checkedBy: actor,
          checkedAt: now
        }, now);
        break;
      case "photo":
        decision = app.core.addPhotoRef(caller, oid, form.get("photoRef") ?? "", now);
        break;
      case "deliver":
        decision = app.core.deliverWithWarranty(caller, oid, {
          months: Number(form.get("months") ?? "0"),
          startsAt: now,
          terms: form.get("terms") ?? ""
        }, actor, now, form.get("signatureRef") ?? undefined);
        break;
      default:
        decision = undefined;
    }
    if (decision !== undefined && decision.decision !== "WRITE_ACCEPTED") {
      sendHtml(res, page(ctx, "Denied", `<div class="notice err"><b>${esc(decision.reasonCode)}</b> — ${esc(decision.humanReadableReason)}</div><a class="btn secondary" href="/orders/${esc(id)}">←</a>`));
      return;
    }
    redirect(res, `/orders/${id}`);
  }

  function voiceView(session: AppSession, ctx: PageContext, outcome: ReturnType<VoiceService["submitTurn"]> | undefined): string {
    const caller = callerOf(session);
    const now = nowIso();
    const L = (key: string) => t(session.locale, key);
    if (!app.flags.voiceSimulationPanel) {
      return page({ ...ctx, activeNav: "/voice" }, L("voicePanel"), `<div class="notice warn">feature flag off</div>`);
    }
    const orders = app.core.listWorkOrders(caller, now);
    const customers = app.core.listCustomers(caller, now);
    const technicians = app.core.listTechnicians(caller, now);
    let resultHtml = "";
    if (outcome !== undefined) {
      const cls = outcome.decision.decision === "VOICE_DENIED" ? "err" : outcome.decision.decision === "PENDING_APPROVAL" ? "warn" : "ok";
      resultHtml = `<div class="notice ${cls}"><b>${esc(outcome.intent.kind)}</b> → ${esc(outcome.decision.decision)}<br>${esc(outcome.decision.humanReadableReason)}
        ${outcome.data !== undefined ? `<pre style="white-space:pre-wrap;font-size:.8rem;margin-top:.5rem">${esc(JSON.stringify(outcome.data, null, 2))}</pre>` : ""}
        ${outcome.pendingId !== undefined ? `
          <div class="actionsrow">
          <form method="post" action="/voice/confirm"><input type="hidden" name="pendingId" value="${esc(outcome.pendingId)}"><button type="submit">${esc(L("confirm"))}</button></form>
          <form method="post" action="/voice/reject"><input type="hidden" name="pendingId" value="${esc(outcome.pendingId)}"><button type="submit" class="danger">${esc(L("reject"))}</button></form>
          </div>` : ""}
      </div>`;
    }
    return page({ ...ctx, activeNav: "/voice" }, L("voicePanel"), `
      <h1>${esc(L("voicePanel"))}</h1>
      <div class="notice warn">${esc(L("voiceHint"))}</div>
      ${resultHtml}
      <form class="stack card" method="post" action="/voice/turn">
        <label>${esc(L("voiceInput"))}<input name="transcript" placeholder="Yeni televizyon servis kaydı aç" required></label>
        <label>${esc(L("customer"))}<select name="customerId"><option value="">—</option>${customers.map((c) => `<option value="${esc(c.id as string)}">${esc(c.fullName)}</option>`).join("")}</select></label>
        <label>${esc(L("orders"))}<select name="workOrderId"><option value="">—</option>${orders.map((o) => `<option value="${esc(o.id as string)}">${esc(o.id as string)} (${esc(o.state)})</option>`).join("")}</select></label>
        <label>${esc(L("technician"))}<select name="technicianId"><option value="">—</option>${technicians.map((x) => `<option value="${esc(x.id as string)}">${esc(x.displayName)}</option>`).join("")}</select></label>
        <button type="submit">${esc(L("send"))}</button>
      </form>
      <div class="card muted">
        "Yeni televizyon servis kaydı aç" · "Bu müşterinin cihazlarını göster" · "Bu cihazı teknisyene ata" ·
        "Cihazı parça bekliyor durumuna getir" · "Bu iş için teklif taslağı oluştur" · "Bugün geciken işleri göster" ·
        "Kritik stokları göster" · "Müşteriye cihaz hazır bildirimi taslağı oluştur"
      </div>`);
  }

  function ocrView(
    session: AppSession,
    ctx: PageContext,
    scan: Awaited<ReturnType<typeof app.ocr.scanLabel>> | undefined,
    confirmed: ReturnType<typeof app.ocr.confirmDraft> | undefined
  ): string {
    const L = (key: string) => t(session.locale, key);
    if (!app.flags.devOcrProvider) {
      return page({ ...ctx, activeNav: "/ocr" }, L("ocrPanel"), `<div class="notice warn">feature flag off</div>`);
    }
    let body = "";
    if (scan !== undefined) {
      if (scan.entry === undefined) {
        body = `<div class="notice err">${esc(scan.decision.humanReadableReason)}</div>`;
      } else {
        const c = scan.entry.candidates;
        body = `<div class="notice warn"><b>UNTRUSTED (OCR_EXTRACTED)</b> — ${esc(scan.entry.draft.extractedText)} <span class="muted">confidence ${scan.entry.draft.confidence}</span></div>
        <h2>${esc(L("ocrCandidates"))}</h2>
        <form class="stack card" method="post" action="/ocr/confirm">
          <input type="hidden" name="draftId" value="${esc(scan.entry.draftId)}">
          <label>${esc(L("brand"))}<input name="brand" value="${esc(c.brand ?? "")}"></label>
          <label>${esc(L("model"))}<input name="model" value="${esc(c.model ?? "")}"></label>
          <label>${esc(L("serialNumber"))}<input name="serialNumber" value="${esc(c.serialNumber ?? "")}"></label>
          <button type="submit">${esc(L("confirmCandidates"))}</button>
        </form>`;
      }
    }
    if (confirmed?.confirmed !== undefined) {
      const q = new URLSearchParams({
        module: "tv_service",
        brand: confirmed.confirmed.brand ?? "",
        model: confirmed.confirmed.model ?? "",
        serial: confirmed.confirmed.serialNumber ?? ""
      });
      body = `<div class="notice ok">${esc(confirmed.decision.humanReadableReason)}</div>
        <a class="btn" href="/devices/new?${esc(q.toString())}">${esc(L("newDevice"))} →</a>`;
    }
    return page({ ...ctx, activeNav: "/ocr" }, L("ocrPanel"), `
      <h1>${esc(L("ocrPanel"))}</h1>
      <div class="notice warn">${esc(L("ocrHint"))} <b>[${esc(app.ocr.providerMetadata.id)} — testOnly]</b></div>
      ${body}
      <form class="stack card" method="post" action="/ocr/scan" id="ocrform">
        <label>Etiket fotoğrafı<input type="file" id="photo" accept=".jpg,.jpeg,.png,.webp"></label>
        <input type="hidden" name="fileName" id="fileName">
        <input type="hidden" name="sizeBytes" id="sizeBytes">
        <button type="submit">${esc(L("scan"))}</button>
      </form>
      <script>
        document.getElementById("photo").addEventListener("change", function () {
          var f = this.files && this.files[0];
          if (f) {
            document.getElementById("fileName").value = f.name;
            document.getElementById("sizeBytes").value = String(f.size);
          }
        });
      </script>`);
  }

  function mobileView(session: AppSession, ctx: PageContext): string {
    const caller = callerOf(session);
    const now = nowIso();
    const L = (key: string) => t(session.locale, key);
    const tasks = technicianTaskView(app.core.listWorkOrders(caller, now));
    const scope = session.scope;
    return page({ ...ctx, activeNav: "/mobile" }, L("mobileView"), `
      <h1>${esc(L("mobileView"))}</h1>
      <div class="notice">Mobile-first teknisyen görünümü. Offline kuyruk tarayıcıda tutulur ve tenant-bağlı zarf olarak senkronize edilir (OfflineSyncGate).</div>
      <h2>${esc(L("orders"))}</h2>
      ${tasks.length === 0 ? `<p class="muted">${esc(L("none"))}</p>` : tasks.map((task) => `
        <div class="card" style="margin-bottom:.6rem">
          <p><a href="/orders/${esc(task.workOrderId)}"><b>${esc(task.workOrderId)}</b></a> ${stateChip(task.state)}</p>
          <p class="muted">${esc(task.reportedProblem)}</p>
          <div class="actionsrow">
            <button class="secondary" onclick="queueOp('${esc(task.workOrderId)}','WAITING_PARTS')">${esc(L("waitingParts"))}</button>
            <button class="secondary" onclick="queueOp('${esc(task.workOrderId)}','TESTING')">${esc(L("toTesting"))}</button>
          </div>
        </div>`).join("")}
      <h2>${esc(L("syncQueue"))}</h2>
      <div class="card">
        <pre id="queueview" style="white-space:pre-wrap;font-size:.8rem"></pre>
        <div class="actionsrow">
          <button onclick="syncNow()">${esc(L("syncNow"))}</button>
          <button class="danger" onclick="localStorage.removeItem('slq');renderQ()">✕</button>
        </div>
        <pre id="syncresult" style="white-space:pre-wrap;font-size:.8rem"></pre>
      </div>
      <script>
        var SCOPE = { tenantId: ${jsonForScript(scope.tenantId)}, organizationId: ${jsonForScript(scope.organizationId)}, workspaceId: ${jsonForScript(scope.workspaceId)} };
        function q(){ try { return JSON.parse(localStorage.getItem('slq')||'[]'); } catch(e){ return []; } }
        function renderQ(){ document.getElementById('queueview').textContent = JSON.stringify(q(), null, 1); }
        function queueOp(wo, to){
          var list = q();
          list.push({ idempotencyKey: wo+'-'+to+'-'+Date.now(), tenantId: SCOPE.tenantId, organizationId: SCOPE.organizationId, workspaceId: SCOPE.workspaceId, kind: 'work_order_transition', workOrderId: wo, to: to });
          localStorage.setItem('slq', JSON.stringify(list));
          renderQ();
        }
        function syncNow(){
          var body = new URLSearchParams();
          body.set('envelope', JSON.stringify({ operations: q() }));
          fetch('/mobile/sync', { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: body.toString() })
            .then(function(r){ return r.json(); })
            .then(function(j){
              document.getElementById('syncresult').textContent = JSON.stringify(j, null, 1);
              if (j.decision && j.decision.decision === 'ENVELOPE_ACCEPTED') { localStorage.removeItem('slq'); renderQ(); }
            });
        }
        renderQ();
      </script>`);
  }

  type VoiceService = ServiceLumiApp["voice"];
}

export function startServiceLumiWeb(app: ServiceLumiApp, port: number): Promise<RunningWeb> {
  const server = createServiceLumiWeb(app);
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address !== null ? address.port : port;
      resolve({
        server,
        port: actualPort,
        app,
        close: () => new Promise<void>((done) => server.close(() => done()))
      });
    });
  });
}
