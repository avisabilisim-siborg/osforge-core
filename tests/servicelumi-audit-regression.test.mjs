// Regression tests for the Opus 4.8 independent audit findings.
import test from "node:test";
import assert from "node:assert/strict";

import {
  ServiceLumiCore,
  customerId,
  deviceId,
  workOrderId,
  customerApprovalRef
} from "../dist/servicelumi-core/src/index.js";
import { ALL_SERVICE_MODULES } from "../dist/servicelumi-modules/src/index.js";
import { evaluateDemoBoot } from "../dist/servicelumi-app/src/index.js";
import { jsonForScript } from "../dist/servicelumi-web/src/html.js";
import { NOW, SHOP_A, caller, OPERATOR } from "./servicelumi-helpers.mjs";

// ---- HIGH-1: demo boot guard is enforced, not just declared ----

test("HIGH-1: the demo boot is refused under NODE_ENV=production without an explicit override", () => {
  assert.equal(evaluateDemoBoot({ nodeEnv: "production" }).status, "BOOT_REFUSED");
  assert.equal(evaluateDemoBoot({ nodeEnv: "Production" }).status, "BOOT_REFUSED");
  assert.equal(evaluateDemoBoot({ nodeEnv: "development" }).status, "BOOT_ALLOWED");
  assert.equal(evaluateDemoBoot({ nodeEnv: undefined }).status, "BOOT_ALLOWED");
});

test("HIGH-1: the production override must be the exact acknowledgement token", () => {
  assert.equal(evaluateDemoBoot({ nodeEnv: "production", allowDemoOverride: "yes" }).status, "BOOT_REFUSED");
  assert.equal(
    evaluateDemoBoot({ nodeEnv: "production", allowDemoOverride: "i-understand-this-is-a-demo" }).status,
    "BOOT_ALLOWED"
  );
});

// ---- MEDIUM-1: approval is bound to the quote the customer reviewed ----

function orderAwaitingApproval() {
  const core = new ServiceLumiCore();
  for (const def of ALL_SERVICE_MODULES) {
    core.registerModule(def, NOW);
  }
  const a = caller(SHOP_A);
  core.enableModule(a, "tv_service", NOW);
  core.createCustomer(a, { id: customerId("c1"), scope: SHOP_A, fullName: "Musteri", createdAt: NOW }, NOW);
  core.registerDevice(a, {
    id: deviceId("d1"), scope: SHOP_A, customerId: customerId("c1"), moduleKey: "tv_service",
    brand: "Vestel", model: "55", attributes: { tvKind: "LED_TV", screenSizeInches: 55, panelType: "LED" }, createdAt: NOW
  }, NOW);
  core.openWorkOrder(a, { id: workOrderId("w1"), customerId: customerId("c1"), deviceId: deviceId("d1"), reportedProblem: "x" }, NOW);
  core.applyWorkOrderTransition(a, workOrderId("w1"), { to: "DIAGNOSING", actorId: OPERATOR, now: NOW, reasonCode: "t" });
  core.applyWorkOrderTransition(a, workOrderId("w1"), {
    to: "QUOTE_PENDING_APPROVAL", actorId: OPERATOR, now: NOW, reasonCode: "t",
    quote: { amountMinor: 100000, currency: "TRY", summary: "Approved price the customer saw" }
  });
  return core;
}

test("MEDIUM-1: a quote cannot be swapped while recording approval (approval binds to the reviewed quote)", () => {
  const core = orderAwaitingApproval();
  const a = caller(SHOP_A);
  const denied = core.applyWorkOrderTransition(a, workOrderId("w1"), {
    to: "APPROVED",
    actorId: OPERATOR,
    now: NOW,
    reasonCode: "t",
    customerApproval: customerApprovalRef("sms-approval-for-100000"),
    quote: { amountMinor: 500000, currency: "TRY", summary: "Secretly higher price" }
  });
  assert.equal(denied.decision, "WRITE_DENIED");
  assert.equal(denied.reasonCode, "approval_quote_immutable");
  // The stored quote is still the one the customer reviewed.
  const order = core.getWorkOrder(a, workOrderId("w1"), NOW).value;
  assert.equal(order.state, "QUOTE_PENDING_APPROVAL");
  assert.equal(order.quote.amountMinor, 100000);
});

test("MEDIUM-1: approval without a quote override still succeeds", () => {
  const core = orderAwaitingApproval();
  const a = caller(SHOP_A);
  const ok = core.applyWorkOrderTransition(a, workOrderId("w1"), {
    to: "APPROVED", actorId: OPERATOR, now: NOW, reasonCode: "t",
    customerApproval: customerApprovalRef("sms-approval-for-100000")
  });
  assert.equal(ok.decision, "WRITE_ACCEPTED");
  const order = core.getWorkOrder(a, workOrderId("w1"), NOW).value;
  assert.equal(order.state, "APPROVED");
  assert.equal(order.quote.amountMinor, 100000);
});

// ---- LOW-1: script-context JSON escaping prevents </script> breakout ----

test("LOW-1: jsonForScript neutralizes a </script> breakout attempt", () => {
  const payload = jsonForScript("</script><script>alert(1)</script>");
  assert.ok(!payload.includes("</script>"));
  assert.ok(payload.includes("\\u003c"));
  // Still valid JSON after unescaping is not required; it must remain a JS string literal.
  assert.equal(typeof JSON.parse(payload.replaceAll("\\u003c", "<")), "string");
});
