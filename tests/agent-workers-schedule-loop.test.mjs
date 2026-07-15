import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateWorkerAdmission,
  assertResumeReauthorized,
  evaluateScheduleFire,
  assertScheduleCarriesNoPermit,
  advanceLoop,
  assertNoPhaseSkip
} from "../dist/agent-runtime/src/index.js";
import { bgTask, schedule, NOW, PAST, FUTURE } from "./agent-helpers.mjs";

// ---- Workers ----
test("a task within retry bounds with a live lease is admitted", () => {
  assert.equal(evaluateWorkerAdmission({ task: bgTask(), now: NOW }).decision, "ADMITTED");
});
test("a poison task is dead-lettered after bounded retries", () => {
  assert.equal(evaluateWorkerAdmission({ task: bgTask({ attempts: 3, maxAttempts: 3 }), now: NOW }).decision, "DEAD_LETTER");
});
test("a completed/dead-lettered task is terminal", () => {
  assert.equal(evaluateWorkerAdmission({ task: bgTask({ state: "COMPLETED" }), now: NOW }).decision, "TERMINAL");
  assert.equal(evaluateWorkerAdmission({ task: bgTask({ state: "DEAD_LETTERED" }), now: NOW }).decision, "TERMINAL");
});
test("an expired capability lease blocks admission", () => {
  assert.equal(evaluateWorkerAdmission({ task: bgTask({ capabilityLeaseExpiresAt: PAST }), now: NOW }).decision, "LEASE_EXPIRED");
});
test("resume must be re-authorized (no stale-auth resume)", () => {
  assert.throws(() => assertResumeReauthorized(false));
  assert.doesNotThrow(() => assertResumeReauthorized(true));
});

// ---- Schedule ----
test("a due schedule fires into a FRESH decision (no stale authorization)", () => {
  assert.equal(evaluateScheduleFire({ schedule: schedule({ fireAt: PAST }), now: NOW }).decision, "FIRE_REQUIRES_FRESH_DECISION");
});
test("a not-yet-due schedule does not fire", () => {
  assert.equal(evaluateScheduleFire({ schedule: schedule({ fireAt: FUTURE }), now: NOW }).decision, "NOT_DUE");
});
test("an expired schedule does not fire", () => {
  assert.equal(evaluateScheduleFire({ schedule: schedule({ fireAt: PAST, expiresAt: PAST }), now: NOW }).decision, "EXPIRED");
});
test("a cancelled/expired-state schedule is terminal", () => {
  assert.equal(evaluateScheduleFire({ schedule: schedule({ state: "CANCELLED" }), now: NOW }).decision, "TERMINAL");
});
test("a schedule must not carry a stored permit", () => {
  assert.throws(() => assertScheduleCarriesNoPermit(true));
  assert.doesNotThrow(() => assertScheduleCarriesNoPermit(false));
});
test("the fresh-decision reason is explicit about no stale authorization", () => {
  assert.match(evaluateScheduleFire({ schedule: schedule(), now: NOW }).humanReadableReason, /never stale authorization/);
});

// ---- Loop ordering ----
test("the loop advances one phase at a time in order", () => {
  assert.equal(advanceLoop("PERCEIVE", undefined, NOW).nextPhase, "PLAN");
  assert.equal(advanceLoop("PLAN", undefined, NOW).nextPhase, "SCREEN");
  assert.equal(advanceLoop("SCREEN", undefined, NOW).nextPhase, "GOVERN");
});
test("GOVERN->ACT only opens on READY_TO_EXECUTE", () => {
  assert.equal(advanceLoop("GOVERN", "READY_TO_EXECUTE", NOW).nextPhase, "ACT");
});
test("GOVERN halts before ACT when not authorized", () => {
  const r = advanceLoop("GOVERN", "DENIED", NOW);
  assert.equal(r.decision.decision, "HALTED");
  assert.equal(r.nextPhase, "HALT");
});
test("the loop halts after OBSERVE", () => {
  assert.equal(advanceLoop("OBSERVE", undefined, NOW).decision.decision, "HALTED");
});
test("skipping a phase is denied", () => {
  assert.throws(() => assertNoPhaseSkip("PLAN", "ACT"));
  assert.throws(() => assertNoPhaseSkip("SCREEN", "ACT"));
  assert.doesNotThrow(() => assertNoPhaseSkip("SCREEN", "GOVERN"));
});
test("ACT follows GOVERN, then OBSERVE", () => {
  assert.equal(advanceLoop("ACT", undefined, NOW).nextPhase, "OBSERVE");
});
