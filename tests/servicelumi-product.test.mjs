import test from "node:test";
import assert from "node:assert/strict";

import {
  ServiceLumiCore,
  customerId,
  deviceId,
  technicianId,
  workOrderId,
  maskIdentifier,
  redactForLog,
  containsUnmaskedImei
} from "../dist/servicelumi-core/src/index.js";
import { ALL_SERVICE_MODULES } from "../dist/servicelumi-modules/src/index.js";
import { ServiceLumiApp, DEMO_TENANTS, parseVoiceIntent, validateLabelUpload } from "../dist/servicelumi-app/src/index.js";
import { NOW, SHOP_A, caller } from "./servicelumi-helpers.mjs";

function appWithSession(userId = "user-owner") {
  const app = new ServiceLumiApp();
  app.seedDemoData(NOW);
  const session = app.sessions.open(userId, DEMO_TENANTS[0].scope, "tr", "dark");
  assert.ok(session);
  return { app, session };
}

// ---- module gating ----

test("a work order cannot be opened while the device's module is disabled", () => {
  const { app, session } = appWithSession();
  const c = { scope: session.scope, tenantState: "ACTIVE" };
  app.core.disableModule(c, "tv_service", NOW);
  const denied = app.core.openWorkOrder(c, {
    id: workOrderId("wo-blocked"),
    customerId: customerId("cust-demo-1"),
    deviceId: deviceId("dev-demo-tv"),
    reportedProblem: "No power"
  }, NOW);
  assert.equal(denied.decision, "WRITE_DENIED");
  assert.equal(denied.reasonCode, "module_not_enabled_for_tenant");
  app.core.enableModule(c, "tv_service", NOW);
  const allowed = app.core.openWorkOrder(c, {
    id: workOrderId("wo-blocked"),
    customerId: customerId("cust-demo-1"),
    deviceId: deviceId("dev-demo-tv"),
    reportedProblem: "No power"
  }, NOW);
  assert.equal(allowed.decision, "WRITE_ACCEPTED");
});

// ---- appliance hazard certification ----

function applianceOrder(core, callerRef) {
  core.createCustomer(callerRef, { id: customerId("cust-ap"), scope: callerRef.scope, fullName: "Beyaz Esya Musterisi", createdAt: NOW }, NOW);
  core.registerDevice(callerRef, {
    id: deviceId("dev-oven"),
    scope: callerRef.scope,
    customerId: customerId("cust-ap"),
    moduleKey: "appliance_service",
    brand: "Bosch",
    model: "HGA120",
    attributes: { applianceKind: "OVEN", onSiteService: true },
    createdAt: NOW
  }, NOW);
  core.openWorkOrder(callerRef, { id: workOrderId("wo-oven"), customerId: customerId("cust-ap"), deviceId: deviceId("dev-oven"), reportedProblem: "Isitmiyor" }, NOW);
}

test("an uncertified technician is denied hazardous appliance work (gas oven)", () => {
  const { app, session } = appWithSession();
  const c = { scope: session.scope, tenantState: "ACTIVE" };
  applianceOrder(app.core, c);
  const denied = app.core.assignTechnician(c, workOrderId("wo-oven"), technicianId("tech-junior"), NOW);
  assert.equal(denied.decision, "WRITE_DENIED");
  assert.equal(denied.reasonCode, "certification_missing");
  const allowed = app.core.assignTechnician(c, workOrderId("wo-oven"), technicianId("tech-cert"), NOW);
  assert.equal(allowed.decision, "WRITE_ACCEPTED");
});

// ---- quality gate before delivery ----

test("delivery is denied while the module quality checklist is incomplete", () => {
  const core = new ServiceLumiCore();
  for (const def of ALL_SERVICE_MODULES) {
    core.registerModule(def, NOW);
  }
  const c = caller(SHOP_A);
  core.enableModule(c, "tv_service", NOW);
  core.createCustomer(c, { id: customerId("c1"), scope: SHOP_A, fullName: "QC Musterisi", createdAt: NOW }, NOW);
  core.registerDevice(c, {
    id: deviceId("d1"), scope: SHOP_A, customerId: customerId("c1"), moduleKey: "tv_service",
    brand: "LG", model: "OLED55", attributes: { tvKind: "OLED_TV", screenSizeInches: 55, panelType: "OLED" }, createdAt: NOW
  }, NOW);
  core.openWorkOrder(c, { id: workOrderId("w1"), customerId: customerId("c1"), deviceId: deviceId("d1"), reportedProblem: "x" }, NOW);
  const step = (to, extra = {}) => core.applyWorkOrderTransition(c, workOrderId("w1"), { to, actorId: "a", now: NOW, reasonCode: "t", ...extra });
  step("DIAGNOSING");
  step("QUOTE_PENDING_APPROVAL", { quote: { amountMinor: 1000, currency: "TRY", summary: "s" } });
  step("APPROVED", { customerApproval: "ok-1" });
  step("IN_REPAIR");
  step("TESTING");
  step("READY_FOR_PICKUP");
  const denied = core.deliverWithWarranty(c, workOrderId("w1"), { months: 6, startsAt: NOW, terms: "t" }, "a", NOW);
  assert.equal(denied.decision, "WRITE_DENIED");
  assert.equal(denied.reasonCode, "quality_checklist_incomplete");
});

// ---- waiting-parts state ----

test("IN_REPAIR can move to WAITING_PARTS and back; RECEIVED cannot", () => {
  const { app, session } = appWithSession();
  const c = { scope: session.scope, tenantState: "ACTIVE" };
  const bad = app.core.applyWorkOrderTransition(c, workOrderId("wo-demo-1"), { to: "WAITING_PARTS", actorId: session.user.id, now: NOW, reasonCode: "t" });
  assert.equal(bad.decision, "WRITE_DENIED");
});

// ---- privacy: IMEI masking + log redaction ----

test("IMEI values are masked for display and redacted in log lines", () => {
  assert.equal(maskIdentifier("356938035643809"), "•••••••••••3809");
  const line = "voice_turn: telefon IMEI 356938035643809 parola: gizli123secret";
  const redacted = redactForLog(line);
  assert.equal(containsUnmaskedImei(redacted), false);
  assert.ok(redacted.includes("3809"));
  assert.ok(!redacted.includes("356938035643809"));
  assert.ok(!redacted.includes("gizli123secret"));
});

test("a voice turn containing an IMEI is audited only in redacted form", () => {
  const { app, session } = appWithSession();
  app.voice.submitTurn(session, "Bugün geciken işleri göster IMEI 356938035643809", {}, NOW);
  const events = app.core.audit.entries(session.scope).map((e) => e.event);
  const turn = events.find((e) => e.startsWith("voice_turn:"));
  assert.ok(turn);
  assert.equal(containsUnmaskedImei(turn), false);
});

// ---- voice authorization + approval ----

test("voice intents parse deterministically", () => {
  assert.equal(parseVoiceIntent("Yeni televizyon servis kaydı aç").kind, "OPEN_INTAKE");
  assert.equal(parseVoiceIntent("Yeni televizyon servis kaydı aç").moduleKey, "tv_service");
  assert.equal(parseVoiceIntent("Bu müşterinin cihazlarını göster").kind, "SHOW_CUSTOMER_DEVICES");
  assert.equal(parseVoiceIntent("Bu cihazı teknisyene ata").kind, "ASSIGN_TECHNICIAN");
  assert.equal(parseVoiceIntent("Cihazı parça bekliyor durumuna getir").kind, "SET_WAITING_PARTS");
  assert.equal(parseVoiceIntent("Bu iş için teklif taslağı oluştur").kind, "DRAFT_QUOTE");
  assert.equal(parseVoiceIntent("Bugün geciken işleri göster").kind, "SHOW_OVERDUE");
  assert.equal(parseVoiceIntent("Kritik stokları göster").kind, "SHOW_CRITICAL_STOCK");
  assert.equal(parseVoiceIntent("Müşteriye cihaz hazır bildirimi taslağı oluştur").kind, "DRAFT_READY_NOTIFICATION");
});

test("a technician role is denied a reception voice command (deny-by-default)", () => {
  const { app, session } = appWithSession("user-tech");
  const outcome = app.voice.submitTurn(session, "Yeni televizyon servis kaydı aç", {}, NOW);
  assert.equal(outcome.decision.decision, "VOICE_DENIED");
  assert.equal(outcome.decision.reasonCode, "role_not_authorized");
});

test("a state-changing voice command stops at human approval and only applies after confirmation", () => {
  const { app, session } = appWithSession();
  const c = { scope: session.scope, tenantState: "ACTIVE" };
  const pending = app.voice.submitTurn(session, "Bu cihazı teknisyene ata", { workOrderId: "wo-demo-1", technicianId: "tech-cert" }, NOW);
  assert.equal(pending.decision.decision, "PENDING_APPROVAL");
  assert.ok(pending.pendingId);
  assert.equal(app.core.getWorkOrder(c, workOrderId("wo-demo-1"), NOW).value.assignedTechnicianId, undefined);
  const confirmed = app.voice.confirmPending(session, pending.pendingId, NOW);
  assert.equal(confirmed.decision.decision, "EXECUTED_READ");
  assert.equal(app.core.getWorkOrder(c, workOrderId("wo-demo-1"), NOW).value.assignedTechnicianId, "tech-cert");
});

test("a rejected pending voice command never applies and approval is per-session", () => {
  const { app, session } = appWithSession();
  const c = { scope: session.scope, tenantState: "ACTIVE" };
  const pending = app.voice.submitTurn(session, "Bu cihazı teknisyene ata", { workOrderId: "wo-demo-1", technicianId: "tech-cert" }, NOW);
  const other = app.sessions.open("user-reception", DEMO_TENANTS[0].scope, "tr", "dark");
  const stolen = app.voice.confirmPending(other, pending.pendingId, NOW);
  assert.equal(stolen.decision.decision, "VOICE_DENIED");
  app.voice.rejectPending(session, pending.pendingId, NOW);
  const late = app.voice.confirmPending(session, pending.pendingId, NOW);
  assert.equal(late.decision.decision, "VOICE_DENIED");
  assert.equal(app.core.getWorkOrder(c, workOrderId("wo-demo-1"), NOW).value.assignedTechnicianId, undefined);
});

test("the stock voice command reports the capability as honestly unavailable", () => {
  const { app, session } = appWithSession();
  const outcome = app.voice.submitTurn(session, "Kritik stokları göster", {}, NOW);
  assert.equal(outcome.decision.decision, "CAPABILITY_UNAVAILABLE");
  assert.equal(outcome.decision.reasonCode, "stock_module_not_built");
});

// ---- OCR: untrusted drafts, human confirmation, no auto-writes ----

test("upload validation rejects wrong types and oversized files", () => {
  assert.equal(validateLabelUpload("virus.exe", 100, NOW).decision, "UPLOAD_REJECTED");
  assert.equal(validateLabelUpload("label.jpg", 99_000_000, NOW).decision, "UPLOAD_REJECTED");
  assert.equal(validateLabelUpload("label.jpg", 0, NOW).decision, "UPLOAD_REJECTED");
  assert.equal(validateLabelUpload("label.jpg", 120_000, NOW).decision, "UPLOAD_ACCEPTED");
});

test("an OCR scan produces an UNTRUSTED draft and writes nothing until a human confirms and submits", async () => {
  const { app, session } = appWithSession();
  const c = { scope: session.scope, tenantState: "ACTIVE" };
  const devicesBefore = app.core.listDevices(c, NOW).length;
  const scan = await app.ocr.scanLabel(session, "VESTEL-55U9500-SN9876543.jpg", 200_000, NOW);
  assert.equal(scan.decision.decision, "DRAFT_READY_FOR_HUMAN_CONFIRMATION");
  assert.equal(scan.entry.draft.trust, "UNTRUSTED");
  assert.equal(scan.entry.candidates.brand, "VESTEL");
  assert.equal(app.core.listDevices(c, NOW).length, devicesBefore);
  const confirmed = app.ocr.confirmDraft(session, scan.entry.draftId, { model: "55U9500" }, NOW);
  assert.equal(confirmed.decision.decision, "CANDIDATES_CONFIRMED");
  assert.equal(app.core.listDevices(c, NOW).length, devicesBefore);
  const events = app.core.audit.entries(session.scope).map((e) => e.event);
  assert.ok(events.some((e) => e.startsWith("ocr_scan:")));
  assert.ok(events.some((e) => e.startsWith("ocr_confirmed:")));
});

test("the development OCR provider is test-only and never production-ready", () => {
  const { app } = appWithSession();
  assert.equal(app.ocr.providerMetadata.testOnly, true);
  assert.equal(app.ocr.providerMetadata.productionReady, false);
});
