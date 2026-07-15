// Detection Foundation test fixtures (P1 Sprint 13 Phase A). Pure fixtures — no engine,
// no network, no secrets. `over` is applied without clobbering composed sub-objects.
import {
  tagProvenance,
  createEvidence,
  createSignal,
  createInput,
  createContext,
  makeConfidence,
  tenantId,
  workspaceId,
  actorId,
  detectionId,
  signalId,
  evidenceId
} from "../dist/detection/src/index.js";

export const NOW = "2026-07-15T18:00:00.000Z";

export const SCOPE = { tenantId: tenantId("t1"), workspaceId: workspaceId("w1") };
export const OTHER_SCOPE = { tenantId: tenantId("t2"), workspaceId: workspaceId("w1") };

export function provenance(over = {}) {
  const { scope, ...rest } = over;
  return tagProvenance({
    origin: "TOOL_OUTPUT",
    scope: scope ?? SCOPE,
    contentDigest: "digest-abc",
    sourceRef: "ref://tool/1",
    observedAt: NOW,
    ...rest
  });
}

export function signal(over = {}) {
  return createSignal({
    signalId: signalId("sig1"),
    category: "PROMPT_INJECTION",
    severity: "MEDIUM",
    ruleRef: "rule://injection/ignore-previous",
    matchDigest: "match-xyz",
    observedAt: NOW,
    ...over
  });
}

export function evidence(over = {}) {
  const { scope, signals, prov, ...rest } = over;
  return createEvidence({
    evidenceId: evidenceId("ev1"),
    scope: scope ?? SCOPE,
    provenance: prov ?? provenance(),
    signals: signals ?? [signal()],
    supportingRefs: [],
    collectedAt: NOW,
    ...rest
  });
}

export function input(over = {}) {
  const { prov, ...rest } = over;
  return createInput({
    artifactDigest: "artifact-123",
    provenance: prov ?? provenance(),
    critical: true,
    ...rest
  });
}

export function context(over = {}) {
  const { scope, ...rest } = over;
  return createContext({
    scope: scope ?? SCOPE,
    actorId: actorId("a1"),
    mode: "production",
    now: NOW,
    ready: true,
    ...rest
  });
}

export function conf(score) {
  return makeConfidence(score);
}

export { detectionId };
