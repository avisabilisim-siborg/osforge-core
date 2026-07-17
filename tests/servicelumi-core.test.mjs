import test from "node:test";
import assert from "node:assert/strict";

import {
  ServiceLumiCore,
  customerId,
  deviceId,
  workOrderId,
  customerApprovalRef,
  legalNextStates,
  SERVICE_MODULE_KEYS
} from "../dist/servicelumi-core/src/index.js";
import { ALL_SERVICE_MODULES, TV_SERVICE_MODULE } from "../dist/servicelumi-modules/src/index.js";
import { NOW, SHOP_A, caller, OPERATOR, TECHNICIAN } from "./servicelumi-helpers.mjs";

function coreWithTv() {
  const core = new ServiceLumiCore();
  for (const def of ALL_SERVICE_MODULES) {
    assert.equal(core.registerModule(def, NOW).decision, "MODULE_REGISTERED");
  }
  assert.equal(core.enableModule(caller(SHOP_A), "tv_service", NOW).decision, "MODULE_ENABLED");
  return core;
}

function intakeTvDevice(core) {
  const a = caller(SHOP_A);
  assert.equal(core.createCustomer(a, {
    id: customerId("cust-1"),
    scope: SHOP_A,
    fullName: "Ayse Yilmaz",
    phone: "+90 555 000 00 00",
    createdAt: NOW
  }, NOW).decision, "WRITE_ACCEPTED");
  assert.equal(core.registerDevice(a, {
    id: deviceId("dev-1"),
    scope: SHOP_A,
    customerId: customerId("cust-1"),
    moduleKey: "tv_service",
    brand: "Vestel",
    model: "55U9500",
    attributes: { tvKind: "LED_TV", screenSizeInches: 55, panelType: "LED", smartTv: true },
    createdAt: NOW
  }, NOW).decision, "WRITE_ACCEPTED");
}

test("all four vertical modules register and expose the declared keys", () => {
  const core = new ServiceLumiCore();
  for (const def of ALL_SERVICE_MODULES) {
    assert.equal(core.registerModule(def, NOW).decision, "MODULE_REGISTERED");
  }
  assert.deepEqual(ALL_SERVICE_MODULES.map((m) => m.key), [...SERVICE_MODULE_KEYS]);
  for (const key of SERVICE_MODULE_KEYS) {
    assert.ok(core.registry.definition(key));
  }
});

test("duplicate module registration is rejected", () => {
  const core = new ServiceLumiCore();
  assert.equal(core.registerModule(TV_SERVICE_MODULE, NOW).decision, "MODULE_REGISTERED");
  const dup = core.registerModule(TV_SERVICE_MODULE, NOW);
  assert.equal(dup.decision, "MODULE_REJECTED");
  assert.equal(dup.reasonCode, "module_already_registered");
});

test("module access is deny-by-default until the tenant enables it", () => {
  const core = new ServiceLumiCore();
  core.registerModule(TV_SERVICE_MODULE, NOW);
  const before = core.registry.evaluateModuleAccess(SHOP_A, "tv_service", NOW);
  assert.equal(before.decision, "MODULE_DENIED");
  assert.equal(before.reasonCode, "module_not_enabled_for_tenant");
  core.enableModule(caller(SHOP_A), "tv_service", NOW);
  assert.equal(core.registry.evaluateModuleAccess(SHOP_A, "tv_service", NOW).decision, "MODULE_ENABLED");
});

test("device registration validates module attributes and denies unknown or malformed fields", () => {
  const core = coreWithTv();
  const a = caller(SHOP_A);
  core.createCustomer(a, { id: customerId("cust-1"), scope: SHOP_A, fullName: "Ayse Yilmaz", createdAt: NOW }, NOW);
  const unknownAttr = core.registerDevice(a, {
    id: deviceId("dev-x"),
    scope: SHOP_A,
    customerId: customerId("cust-1"),
    moduleKey: "tv_service",
    brand: "Vestel",
    model: "55U9500",
    attributes: { tvKind: "LED_TV", screenSizeInches: 55, panelType: "LED", notDeclared: "x" },
    createdAt: NOW
  }, NOW);
  assert.equal(unknownAttr.decision, "WRITE_DENIED");
  const badEnum = core.registerDevice(a, {
    id: deviceId("dev-y"),
    scope: SHOP_A,
    customerId: customerId("cust-1"),
    moduleKey: "tv_service",
    brand: "Vestel",
    model: "55U9500",
    attributes: { tvKind: "LED_TV", screenSizeInches: 55, panelType: "CRT" },
    createdAt: NOW
  }, NOW);
  assert.equal(badEnum.decision, "WRITE_DENIED");
});

test("a full work order lifecycle runs bench flow to delivery with audited transitions", () => {
  const core = coreWithTv();
  const a = caller(SHOP_A);
  intakeTvDevice(core);
  assert.equal(core.openWorkOrder(a, {
    id: workOrderId("wo-1"),
    customerId: customerId("cust-1"),
    deviceId: deviceId("dev-1"),
    reportedProblem: "Sound present, no picture"
  }, NOW).decision, "WRITE_ACCEPTED");

  const step = (to, extra = {}) =>
    core.applyWorkOrderTransition(a, workOrderId("wo-1"), { to, actorId: TECHNICIAN, now: NOW, reasonCode: `move_${to.toLowerCase()}`, ...extra });

  assert.equal(step("DIAGNOSING", { faultCodes: ["TV_NO_BACKLIGHT"], diagnosisNote: "Backlight bar dead" }).decision, "WRITE_ACCEPTED");
  assert.equal(step("QUOTE_PENDING_APPROVAL", { quote: { amountMinor: 250000, currency: "TRY", summary: "Backlight bar replacement" } }).decision, "WRITE_ACCEPTED");
  assert.equal(step("APPROVED", { customerApproval: customerApprovalRef("approval-sms-123") }).decision, "WRITE_ACCEPTED");
  assert.equal(step("IN_REPAIR").decision, "WRITE_ACCEPTED");
  assert.equal(step("TESTING").decision, "WRITE_ACCEPTED");
  assert.equal(step("READY_FOR_PICKUP").decision, "WRITE_ACCEPTED");
  assert.equal(step("DELIVERED").decision, "WRITE_ACCEPTED");

  const finalOrder = core.getWorkOrder(a, workOrderId("wo-1"), NOW).value;
  assert.equal(finalOrder.state, "DELIVERED");
  assert.equal(finalOrder.history.length, 7);
  assert.deepEqual(legalNextStates(finalOrder.state), []);
  assert.equal(core.audit.verify(SHOP_A), true);
  const events = core.audit.entries(SHOP_A).map((e) => e.event);
  assert.ok(events.some((e) => e.startsWith("work_order_opened:wo-1")));
  assert.ok(events.some((e) => e.includes("READY_FOR_PICKUP->DELIVERED")));
});

test("a quote cannot be approved without a recorded customer approval reference", () => {
  const core = coreWithTv();
  const a = caller(SHOP_A);
  intakeTvDevice(core);
  core.openWorkOrder(a, { id: workOrderId("wo-2"), customerId: customerId("cust-1"), deviceId: deviceId("dev-1"), reportedProblem: "No power" }, NOW);
  const step = (to, extra = {}) =>
    core.applyWorkOrderTransition(a, workOrderId("wo-2"), { to, actorId: OPERATOR, now: NOW, reasonCode: "t", ...extra });
  step("DIAGNOSING", { faultCodes: ["TV_NO_POWER"] });
  step("QUOTE_PENDING_APPROVAL", { quote: { amountMinor: 100000, currency: "TRY", summary: "Power board repair" } });
  const denied = step("APPROVED");
  assert.equal(denied.decision, "WRITE_DENIED");
  assert.equal(denied.reasonCode, "customer_approval_missing");
});

test("illegal work order transitions are denied with the legal alternatives explained", () => {
  const core = coreWithTv();
  const a = caller(SHOP_A);
  intakeTvDevice(core);
  core.openWorkOrder(a, { id: workOrderId("wo-3"), customerId: customerId("cust-1"), deviceId: deviceId("dev-1"), reportedProblem: "Lines on panel" }, NOW);
  const denied = core.applyWorkOrderTransition(a, workOrderId("wo-3"), { to: "DELIVERED", actorId: OPERATOR, now: NOW, reasonCode: "skip" });
  assert.equal(denied.decision, "WRITE_DENIED");
  assert.equal(denied.reasonCode, "illegal_transition");
});

test("fault codes outside the module taxonomy are denied", () => {
  const core = coreWithTv();
  const a = caller(SHOP_A);
  intakeTvDevice(core);
  core.openWorkOrder(a, { id: workOrderId("wo-4"), customerId: customerId("cust-1"), deviceId: deviceId("dev-1"), reportedProblem: "No signal" }, NOW);
  const denied = core.applyWorkOrderTransition(a, workOrderId("wo-4"), { to: "DIAGNOSING", actorId: TECHNICIAN, now: NOW, reasonCode: "t", faultCodes: ["PH_BATTERY"] });
  assert.equal(denied.decision, "WRITE_DENIED");
  assert.equal(denied.reasonCode, "fault_code_unknown");
});

test("a work order cannot reference a device owned by a different customer", () => {
  const core = coreWithTv();
  const a = caller(SHOP_A);
  intakeTvDevice(core);
  core.createCustomer(a, { id: customerId("cust-2"), scope: SHOP_A, fullName: "Mehmet Demir", createdAt: NOW }, NOW);
  const denied = core.openWorkOrder(a, { id: workOrderId("wo-5"), customerId: customerId("cust-2"), deviceId: deviceId("dev-1"), reportedProblem: "No power" }, NOW);
  assert.equal(denied.decision, "WRITE_DENIED");
  assert.equal(denied.reasonCode, "customer_device_mismatch");
});
