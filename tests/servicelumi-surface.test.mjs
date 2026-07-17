import test from "node:test";
import assert from "node:assert/strict";

import {
  ServiceLumiCore,
  customerId,
  deviceId,
  workOrderId
} from "../dist/servicelumi-core/src/index.js";
import { ALL_SERVICE_MODULES, TV_SERVICE_MODULE } from "../dist/servicelumi-modules/src/index.js";
import {
  BOARD_COLUMNS,
  workOrderBoardView,
  workOrderDetailView,
  receptionIntakeView,
  technicianTaskView,
  OfflineSyncGate
} from "../dist/servicelumi-surface/src/index.js";
import { NOW, SHOP_A, SHOP_B, caller, TECHNICIAN } from "./servicelumi-helpers.mjs";

function seededCore() {
  const core = new ServiceLumiCore();
  for (const def of ALL_SERVICE_MODULES) {
    core.registerModule(def, NOW);
  }
  core.enableModule(caller(SHOP_A), "tv_service", NOW);
  const a = caller(SHOP_A);
  core.createCustomer(a, { id: customerId("cust-a"), scope: SHOP_A, fullName: "Ayse Yilmaz", createdAt: NOW }, NOW);
  core.registerDevice(a, {
    id: deviceId("dev-a"),
    scope: SHOP_A,
    customerId: customerId("cust-a"),
    moduleKey: "tv_service",
    brand: "Vestel",
    model: "55U9500",
    attributes: { tvKind: "LED_TV", screenSizeInches: 55, panelType: "LED" },
    createdAt: NOW
  }, NOW);
  core.openWorkOrder(a, { id: workOrderId("wo-a"), customerId: customerId("cust-a"), deviceId: deviceId("dev-a"), reportedProblem: "No picture" }, NOW);
  return core;
}

test("the work order board groups orders into the state-machine columns", () => {
  const core = seededCore();
  const a = caller(SHOP_A);
  const order = core.getWorkOrder(a, workOrderId("wo-a"), NOW).value;
  const board = workOrderBoardView([order]);
  assert.equal(board.totalCount, 1);
  assert.deepEqual(board.columns.map((c) => c.state), [...BOARD_COLUMNS]);
  const received = board.columns.find((c) => c.state === "RECEIVED");
  assert.equal(received.cards.length, 1);
  assert.equal(received.cards[0].workOrderId, "wo-a");
});

test("the detail view exposes only legal next actions and resolves fault labels", () => {
  const core = seededCore();
  const a = caller(SHOP_A);
  core.applyWorkOrderTransition(a, workOrderId("wo-a"), { to: "DIAGNOSING", actorId: TECHNICIAN, now: NOW, reasonCode: "t", faultCodes: ["TV_NO_BACKLIGHT"] });
  const order = core.getWorkOrder(a, workOrderId("wo-a"), NOW).value;
  const customer = core.getCustomer(a, customerId("cust-a"), NOW).value;
  const device = core.getDevice(a, deviceId("dev-a"), NOW).value;
  const detail = workOrderDetailView(order, customer, device, TV_SERVICE_MODULE);
  assert.equal(detail.deviceLabel, "Vestel 55U9500");
  assert.deepEqual(detail.faultLabels, ["Sound present, no backlight"]);
  assert.deepEqual(detail.allowedNextStates, ["QUOTE_PENDING_APPROVAL", "CANCELLED"]);
  assert.equal(detail.historyLines.length, 1);
});

test("the reception intake view mirrors the module checklist and device fields", () => {
  const view = receptionIntakeView(TV_SERVICE_MODULE);
  assert.equal(view.moduleKey, "tv_service");
  assert.equal(view.deviceFields.some((f) => f.name === "panelType" && f.enumValues.includes("OLED")), true);
  assert.equal(view.intakeChecklist.length > 0, true);
});

test("the technician task view lists only actionable states", () => {
  const core = seededCore();
  const a = caller(SHOP_A);
  const received = core.getWorkOrder(a, workOrderId("wo-a"), NOW).value;
  assert.deepEqual(technicianTaskView([received]), []);
  const step = (to, extra = {}) =>
    core.applyWorkOrderTransition(a, workOrderId("wo-a"), { to, actorId: TECHNICIAN, now: NOW, reasonCode: "t", ...extra });
  step("DIAGNOSING");
  step("QUOTE_PENDING_APPROVAL", { quote: { amountMinor: 1000, currency: "TRY", summary: "s" } });
  step("APPROVED", { customerApproval: "approval-1" });
  const approved = core.getWorkOrder(a, workOrderId("wo-a"), NOW).value;
  const tasks = technicianTaskView([approved]);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].state, "APPROVED");
});

test("adversarial: a sync envelope with a cross-tenant operation is rejected whole", () => {
  const gate = new OfflineSyncGate();
  const evaluation = gate.evaluate({
    scope: SHOP_A,
    operations: [
      { idempotencyKey: "op-1", scope: SHOP_A, kind: "diagnosis_note", queuedAt: NOW },
      { idempotencyKey: "op-2", scope: SHOP_B, kind: "work_order_transition", queuedAt: NOW }
    ],
    preparedAt: NOW
  }, NOW);
  assert.equal(evaluation.decision.decision, "ENVELOPE_REJECTED");
  assert.equal(evaluation.decision.reasonCode, "envelope_scope_violation");
  assert.equal(evaluation.accepted.length, 0);
});

test("adversarial: replayed offline operations are deduplicated by idempotency key", () => {
  const gate = new OfflineSyncGate();
  const envelope = {
    scope: SHOP_A,
    operations: [{ idempotencyKey: "op-1", scope: SHOP_A, kind: "diagnosis_note", queuedAt: NOW }],
    preparedAt: NOW
  };
  const first = gate.evaluate(envelope, NOW);
  assert.equal(first.decision.decision, "ENVELOPE_ACCEPTED");
  assert.equal(first.accepted.length, 1);
  const replay = gate.evaluate(envelope, NOW);
  assert.equal(replay.decision.decision, "ENVELOPE_ACCEPTED");
  assert.equal(replay.accepted.length, 0);
  assert.deepEqual(replay.duplicates, ["op-1"]);
});

test("adversarial: a missing idempotency key rejects the envelope", () => {
  const gate = new OfflineSyncGate();
  const evaluation = gate.evaluate({
    scope: SHOP_A,
    operations: [{ idempotencyKey: " ", scope: SHOP_A, kind: "diagnosis_note", queuedAt: NOW }],
    preparedAt: NOW
  }, NOW);
  assert.equal(evaluation.decision.decision, "ENVELOPE_REJECTED");
  assert.equal(evaluation.decision.reasonCode, "idempotency_key_missing");
});
