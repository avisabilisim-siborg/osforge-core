import test from "node:test";
import assert from "node:assert/strict";

import {
  ServiceLumiCore,
  customerId,
  deviceId,
  workOrderId
} from "../dist/servicelumi-core/src/index.js";
import { ALL_SERVICE_MODULES } from "../dist/servicelumi-modules/src/index.js";
import { NOW, SHOP_A, SHOP_B, caller, OPERATOR } from "./servicelumi-helpers.mjs";

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
    attributes: { screenSizeInches: 55, panelType: "LED" },
    createdAt: NOW
  }, NOW);
  core.openWorkOrder(a, { id: workOrderId("wo-a"), customerId: customerId("cust-a"), deviceId: deviceId("dev-a"), reportedProblem: "No picture" }, NOW);
  return core;
}

test("adversarial: another tenant cannot read a customer, device or work order", () => {
  const core = seededCore();
  const b = caller(SHOP_B);
  const customer = core.getCustomer(b, customerId("cust-a"), NOW);
  assert.equal(customer.decision.decision, "READ_DENIED");
  assert.equal(customer.value, undefined);
  const device = core.getDevice(b, deviceId("dev-a"), NOW);
  assert.equal(device.decision.decision, "READ_DENIED");
  assert.equal(device.value, undefined);
  const order = core.getWorkOrder(b, workOrderId("wo-a"), NOW);
  assert.equal(order.decision.decision, "READ_DENIED");
  assert.equal(order.value, undefined);
});

test("adversarial: a denied cross-tenant read does not reveal whether the record exists", () => {
  const core = seededCore();
  const b = caller(SHOP_B);
  const existing = core.getCustomer(b, customerId("cust-a"), NOW);
  const missing = core.getCustomer(b, customerId("cust-never"), NOW);
  assert.equal(existing.decision.reasonCode, missing.decision.reasonCode);
  assert.equal(existing.decision.decision, missing.decision.decision);
});

test("adversarial: another tenant cannot overwrite a record id it does not own", () => {
  const core = seededCore();
  core.enableModule(caller(SHOP_B), "tv_service", NOW);
  const b = caller(SHOP_B);
  const hijack = core.createCustomer(b, { id: customerId("cust-a"), scope: SHOP_B, fullName: "Hijack Attempt", createdAt: NOW }, NOW);
  assert.equal(hijack.decision, "WRITE_DENIED");
  const original = core.getCustomer(caller(SHOP_A), customerId("cust-a"), NOW);
  assert.equal(original.value.fullName, "Ayse Yilmaz");
});

test("adversarial: another tenant cannot transition a foreign work order", () => {
  const core = seededCore();
  const denied = core.applyWorkOrderTransition(caller(SHOP_B), workOrderId("wo-a"), {
    to: "DIAGNOSING",
    actorId: OPERATOR,
    now: NOW,
    reasonCode: "cross_tenant_attempt"
  });
  assert.equal(denied.decision, "WRITE_DENIED");
  const untouched = core.getWorkOrder(caller(SHOP_A), workOrderId("wo-a"), NOW);
  assert.equal(untouched.value.state, "RECEIVED");
});

test("adversarial: a forged scope pointing at another tenant is denied at write time", () => {
  const core = seededCore();
  core.enableModule(caller(SHOP_B), "tv_service", NOW);
  const forged = core.createCustomer(caller(SHOP_B), {
    id: customerId("cust-forged"),
    scope: SHOP_A,
    fullName: "Forged Owner",
    createdAt: NOW
  }, NOW);
  assert.equal(forged.decision, "WRITE_DENIED");
  assert.equal(core.getCustomer(caller(SHOP_A), customerId("cust-forged"), NOW).value, undefined);
});

test("adversarial: a suspended tenant is denied its own reads and writes (fail closed)", () => {
  const core = seededCore();
  const suspended = caller(SHOP_A, "SUSPENDED");
  assert.equal(core.getCustomer(suspended, customerId("cust-a"), NOW).decision.decision, "READ_DENIED");
  const write = core.createCustomer(suspended, { id: customerId("cust-s"), scope: SHOP_A, fullName: "New", createdAt: NOW }, NOW);
  assert.equal(write.decision, "WRITE_DENIED");
});

test("adversarial: module enablement in one tenant never leaks to another", () => {
  const core = seededCore();
  const accessB = core.registry.evaluateModuleAccess(SHOP_B, "tv_service", NOW);
  assert.equal(accessB.decision, "MODULE_DENIED");
  assert.equal(accessB.reasonCode, "module_not_enabled_for_tenant");
  const write = core.registerDevice(caller(SHOP_B), {
    id: deviceId("dev-b"),
    scope: SHOP_B,
    customerId: customerId("cust-b"),
    moduleKey: "tv_service",
    brand: "X",
    model: "Y",
    attributes: { screenSizeInches: 40, panelType: "LED" },
    createdAt: NOW
  }, NOW);
  assert.equal(write.decision, "WRITE_DENIED");
});

test("audit partitions stay per-tenant: shop A activity never appears in shop B's chain", () => {
  const core = seededCore();
  core.enableModule(caller(SHOP_B), "computer_service", NOW);
  const aEvents = core.audit.entries(SHOP_A).map((e) => e.event);
  const bEvents = core.audit.entries(SHOP_B).map((e) => e.event);
  assert.ok(aEvents.length > 0);
  assert.ok(aEvents.every((e) => !e.includes("computer_service")));
  assert.ok(bEvents.every((e) => !e.includes("wo-a") && !e.includes("cust-a")));
  assert.equal(core.audit.verify(SHOP_A), true);
  assert.equal(core.audit.verify(SHOP_B), true);
});

test("list surfaces only the caller tenant's records", () => {
  const core = seededCore();
  core.enableModule(caller(SHOP_B), "tv_service", NOW);
  const b = caller(SHOP_B);
  core.createCustomer(b, { id: customerId("cust-b"), scope: SHOP_B, fullName: "Shop B Customer", createdAt: NOW }, NOW);
  const aCustomer = core.getCustomer(caller(SHOP_A), customerId("cust-a"), NOW);
  const bCustomer = core.getCustomer(b, customerId("cust-b"), NOW);
  assert.equal(aCustomer.value.scope.tenantId, SHOP_A.tenantId);
  assert.equal(bCustomer.value.scope.tenantId, SHOP_B.tenantId);
  assert.equal(core.getCustomer(b, customerId("cust-a"), NOW).value, undefined);
  assert.equal(core.getCustomer(caller(SHOP_A), customerId("cust-b"), NOW).value, undefined);
});
