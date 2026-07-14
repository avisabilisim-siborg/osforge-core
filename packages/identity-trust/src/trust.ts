import { elapsedMs, isFuture, isNonEmptyString } from "./internal/crypto.js";
import {
  assuranceMeets,
  decide,
  type AssuranceLevel,
  type IdentityDecision,
  type IdentityScope,
  type PrincipalId,
  type TrustLevel
} from "./types.js";

/**
 * Trust model (P0.6, §8) and assurance (§9). Trust is evaluated from evidence,
 * issuers and context — never assumed. A trust decision is explainable and is
 * NOT an authorization result.
 */
export interface TrustAnchor {
  anchorId: string;
  issuerId: string;
  revoked: boolean;
}
export interface TrustEvidenceRef {
  evidenceId: string;
  verified: boolean;
  issuerId: string;
}
export interface TrustChainLink {
  issuerId: string;
  anchorId: string;
}
export interface TrustContext {
  scope: IdentityScope;
  principalId: PrincipalId;
  assuranceLevel: AssuranceLevel;
  region?: string;
}

export type TrustDecisionStatus =
  | "TRUSTED"
  | "CONDITIONALLY_TRUSTED"
  | "STEP_UP_REQUIRED"
  | "REJECTED"
  | "REVOKED"
  | "EXPIRED"
  | "EVIDENCE_MISSING"
  | "ISSUER_UNTRUSTED"
  | "TENANT_MISMATCH"
  | "CONTEXT_MISMATCH";

export interface TrustEvaluationInput {
  context: TrustContext;
  evidence: readonly TrustEvidenceRef[];
  chain: readonly TrustChainLink[];
  anchors: readonly TrustAnchor[];
  expectedScope: IdentityScope;
  expectedRegion?: string;
  requiredAssurance: AssuranceLevel;
  evidenceIssuedAt?: string;
  maxEvidenceAgeMs?: number;
  now: string;
}

export function evaluateTrust(input: TrustEvaluationInput): IdentityDecision<TrustDecisionStatus> {
  const base = {
    evaluatedAt: input.now,
    evidenceReferences: input.evidence.map((e) => e.evidenceId),
    issuerReferences: input.chain.map((c) => c.issuerId)
  };
  const reject = (decision: TrustDecisionStatus, reasonCode: string, message: string, nextRequiredAction = "halt") =>
    decide<TrustDecisionStatus>({ ...base, decision, reasonCode, humanReadableReason: message, nextRequiredAction });

  const verified = input.evidence.filter((e) => e.verified);
  if (verified.length === 0) {
    return reject("EVIDENCE_MISSING", "trust_evidence_missing", "No verified trust evidence.");
  }
  const anchorById = new Map(input.anchors.map((a) => [a.anchorId, a]));
  for (const link of input.chain) {
    const anchor = anchorById.get(link.anchorId);
    if (!anchor || anchor.issuerId !== link.issuerId) {
      return reject("ISSUER_UNTRUSTED", "trust_issuer_untrusted", "Trust chain references an unknown anchor/issuer.");
    }
    if (anchor.revoked) {
      return reject("REVOKED", "trust_anchor_revoked", "A trust anchor in the chain is revoked.");
    }
  }
  // Cycle detection in the trust chain.
  const seen = new Set<string>();
  for (const link of input.chain) {
    if (seen.has(link.issuerId)) {
      return reject("REJECTED", "trust_chain_cycle", "Trust chain contains a cycle.");
    }
    seen.add(link.issuerId);
  }
  if (input.context.scope.tenantId !== input.expectedScope.tenantId || input.context.scope.workspaceId !== input.expectedScope.workspaceId) {
    return reject("TENANT_MISMATCH", "trust_tenant_mismatch", "Trust context tenant/workspace mismatch.");
  }
  if (isNonEmptyString(input.expectedRegion) && input.context.region !== undefined && input.context.region !== input.expectedRegion) {
    return reject("CONTEXT_MISMATCH", "trust_region_mismatch", "Cross-region trust context mismatch.");
  }
  // Stale evidence lowers trust: beyond the max age → step up.
  if (isNonEmptyString(input.evidenceIssuedAt) && input.maxEvidenceAgeMs !== undefined && elapsedMs(input.evidenceIssuedAt, input.now) > input.maxEvidenceAgeMs) {
    return reject("STEP_UP_REQUIRED", "trust_evidence_stale", "Trust evidence is stale; re-verification required.", "step_up");
  }
  if (!assuranceMeets(input.context.assuranceLevel, input.requiredAssurance)) {
    return reject("STEP_UP_REQUIRED", "assurance_below_required", "Assurance level is below the required level.", "step_up");
  }

  return decide<TrustDecisionStatus>({ ...base, decision: "TRUSTED", reasonCode: "trusted", humanReadableReason: "Trust evaluation succeeded.", nextRequiredAction: "continue" });
}

// ---- Assurance ----

/** Trust/assurance decays over time; returns a possibly-lowered level. */
export function decayAssurance(level: AssuranceLevel, ageMs: number, halfLifeMs: number): AssuranceLevel {
  if (halfLifeMs <= 0 || ageMs < halfLifeMs) {
    return level;
  }
  const steps = Math.floor(ageMs / halfLifeMs);
  const order: AssuranceLevel[] = ["A0_UNVERIFIED", "A1_BASIC", "A2_VERIFIED", "A3_STRONG", "A4_HARDWARE_BOUND"];
  const idx = Math.max(0, order.indexOf(level) - steps);
  return order[idx] ?? "A0_UNVERIFIED";
}

/** An identity can never raise its own assurance — only a fresh verification can. */
export function assertNoAssuranceSelfEscalation(current: AssuranceLevel, requested: AssuranceLevel): void {
  if (!assuranceMeets(current, requested) && requested !== current) {
    throw new Error("Assurance self-escalation is denied; a fresh verification is required.");
  }
}

export function trustLevelFor(assurance: AssuranceLevel): TrustLevel {
  switch (assurance) {
    case "A4_HARDWARE_BOUND": return "HARDWARE_ATTESTED";
    case "A3_STRONG": return "HIGH";
    case "A2_VERIFIED": return "MEDIUM";
    case "A1_BASIC": return "LOW";
    default: return "UNKNOWN";
  }
}

void isFuture;
