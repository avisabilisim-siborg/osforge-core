// Content-trust test fixtures (P1 Sprint 13 Phase B). Pure fixtures — no engine, no secrets.
import {
  tagContentProvenance,
  createContentInput,
  createContentContext,
  contentId,
  tenantId,
  workspaceId,
  actorId
} from "../dist/content-trust/src/index.js";

export const NOW = "2026-07-15T19:00:00.000Z";
export const LATER = "2026-07-15T19:30:00.000Z";
export const PAST = "2026-07-15T18:00:00.000Z";

export const SCOPE = { tenantId: tenantId("t1"), workspaceId: workspaceId("w1") };
export const OTHER_SCOPE = { tenantId: tenantId("t2"), workspaceId: workspaceId("w1") };

export function provenance(over = {}) {
  const { scope, ...rest } = over;
  return tagContentProvenance({
    source: "TOOL_OUTPUT",
    scope: scope ?? SCOPE,
    contentDigest: "digest-abc",
    originRef: "ref://tool/1",
    observedAt: NOW,
    ...rest
  });
}

export function contentInput(over = {}) {
  const { prov, ...rest } = over;
  return createContentInput({
    contentDigest: "digest-abc",
    declaredClassification: "INTERNAL",
    provenance: prov ?? provenance(),
    byteLength: 1000,
    critical: true,
    ...rest
  });
}

export function contentContext(over = {}) {
  const { scope, ...rest } = over;
  return createContentContext({
    scope: scope ?? SCOPE,
    actorId: actorId("a1"),
    mode: "production",
    now: NOW,
    ready: true,
    ...rest
  });
}

export { contentId, actorId };
