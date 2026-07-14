import test from "node:test";
import assert from "node:assert/strict";

import {
  MaxDriftDetector,
  SystemAttestedClock,
  FakeAttestedClock,
  assertClockDriftForSecurityDecision,
  SecureRandomIdFactory,
  SequentialTestIdFactory,
  assertProductionIdFactory
} from "../dist/adapters/src/index.js";

test("drift within tolerance is accepted; beyond tolerance a critical action is rejected", () => {
  const detector = new MaxDriftDetector(1000);
  const within = detector.measure("2026-07-14T12:00:00.000Z", "2026-07-14T12:00:00.500Z");
  assert.equal(within.withinTolerance, true);
  assert.doesNotThrow(() => assertClockDriftForSecurityDecision(within));

  const beyond = detector.measure("2026-07-14T12:00:00.000Z", "2026-07-14T12:00:05.000Z");
  assert.equal(beyond.withinTolerance, false);
  assert.throws(() => assertClockDriftForSecurityDecision(beyond));
});

test("unmeasurable drift fails closed", () => {
  const detector = new MaxDriftDetector(1000);
  const report = detector.measure("not-a-date", "2026-07-14T12:00:00.000Z");
  assert.equal(report.withinTolerance, false);
});

test("system clock is not production-ready unless externally attested", () => {
  assert.equal(new SystemAttestedClock().metadata.productionReady, false);
  const attested = new SystemAttestedClock({ attested: true });
  assert.equal(attested.metadata.productionReady, true);
  assert.equal(attested.metadata.attestation, "TRUSTED");
});

test("fake clock is deterministic and test-only", () => {
  const clock = new FakeAttestedClock("2026-07-14T12:00:00.000Z");
  assert.equal(clock.now(), "2026-07-14T12:00:00.000Z");
  assert.equal(clock.metadata.testOnly, true);
  clock.advance(1000);
  assert.equal(clock.now(), "2026-07-14T12:00:01.000Z");
});

test("sequential test id factory is refused in production", () => {
  const seq = new SequentialTestIdFactory();
  assert.equal(seq.metadata.testOnly, true);
  assert.throws(() => assertProductionIdFactory(seq));
});

test("secure random id factory produces unpredictable, unique ids and is production-usable", () => {
  const factory = new SecureRandomIdFactory();
  assert.doesNotThrow(() => assertProductionIdFactory(factory));
  const a = factory.next("permit");
  const b = factory.next("permit");
  assert.notEqual(a, b);
  assert.notEqual(a, "permit_1"); // not the predictable sequential form
  assert.match(a, /^permit_[0-9a-f-]{36}$/u);
});
