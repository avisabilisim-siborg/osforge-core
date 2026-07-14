import { canonicalJson, isNonEmptyString, sha256Hex } from "./internal/crypto.js";
import type { SignatureVerifier, TrustStore } from "./trust.js";

/**
 * Policy compilation boundary (requirement §9). No real NL compiler is built.
 *
 * Natural-language proposal → parsed AST → static validation → conflict
 * detection → human review → signed artifact → runtime policy. An AI may only
 * draft; it can never activate. Compilation is deterministic; ambiguous or
 * conflicting policies fail closed; an unsigned artifact never loads.
 */
export interface PolicyProposal {
  proposalId: string;
  naturalLanguage: string;
  proposedByActor: string;
  proposedByAI: boolean;
}

export interface PolicyAstRule {
  effect: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
  resourceType: string;
  action: string;
}

export interface PolicyAST {
  proposalId: string;
  rules: readonly PolicyAstRule[];
  deterministicHash: string;
}

export type PolicyCompileVerdict = "COMPILED" | "AMBIGUOUS" | "REJECTED";

export interface PolicyCompileResult {
  verdict: PolicyCompileVerdict;
  ast?: PolicyAST;
  reasonCode: string;
}

export interface PolicyCompiler {
  compile(proposal: PolicyProposal, rules: readonly PolicyAstRule[] | undefined): PolicyCompileResult;
}

/**
 * Reference compiler: rules must be provided explicitly (a real NL compiler is
 * out of scope). Missing/empty structured rules → AMBIGUOUS (fail closed). The
 * AST hash is deterministic over canonical rules.
 */
export class ReferencePolicyCompiler implements PolicyCompiler {
  compile(proposal: PolicyProposal, rules: readonly PolicyAstRule[] | undefined): PolicyCompileResult {
    if (!rules || rules.length === 0) {
      return { verdict: "AMBIGUOUS", reasonCode: "ambiguous_proposal" };
    }
    const deterministicHash = sha256Hex(canonicalJson({ proposalId: proposal.proposalId, rules }));
    return { verdict: "COMPILED", ast: { proposalId: proposal.proposalId, rules: [...rules], deterministicHash }, reasonCode: "compiled" };
  }
}

export interface PolicyConflict {
  resourceType: string;
  action: string;
  reason: string;
}

export type PolicyValidationVerdict = "VALID" | "CONFLICTING";

export interface PolicyValidationResult {
  verdict: PolicyValidationVerdict;
  conflicts: readonly PolicyConflict[];
  reasonCode: string;
}

export function validatePolicyAst(ast: PolicyAST): PolicyValidationResult {
  const conflicts: PolicyConflict[] = [];
  const byKey = new Map<string, Set<string>>();
  for (const rule of ast.rules) {
    const key = `${rule.resourceType}:${rule.action}`;
    const effects = byKey.get(key) ?? new Set<string>();
    effects.add(rule.effect);
    byKey.set(key, effects);
  }
  for (const [key, effects] of byKey) {
    if (effects.has("ALLOW") && effects.has("DENY")) {
      const [resourceType, action] = key.split(":");
      conflicts.push({ resourceType: resourceType ?? "", action: action ?? "", reason: "ALLOW and DENY on the same resource/action." });
    }
  }
  // Conflicts fail closed.
  return conflicts.length > 0
    ? { verdict: "CONFLICTING", conflicts, reasonCode: "policy_conflict" }
    : { verdict: "VALID", conflicts: [], reasonCode: "valid" };
}

export interface PolicySignature {
  algorithm: string;
  keyId: string;
  signature: string;
}

export interface PolicyArtifact {
  artifactId: string;
  proposalId: string;
  astHash: string;
  signature: PolicySignature;
}

export interface PolicyActivationApproval {
  approvalId: string;
  approverIsHuman: boolean;
}

export interface PolicyActivationRequest {
  artifact: PolicyArtifact;
  activatedByAI: boolean;
  approval?: PolicyActivationApproval;
}

export interface PolicyActivationResult {
  ok: boolean;
  reasonCode: string;
  message: string;
}

export function evaluatePolicyActivation(
  request: PolicyActivationRequest,
  ctx: { signatureVerifier: SignatureVerifier; trustStore: TrustStore }
): PolicyActivationResult {
  // An AI can never activate a policy.
  if (request.activatedByAI) {
    return { ok: false, reasonCode: "ai_cannot_activate_policy", message: "An AI can only draft policy, never activate it." };
  }
  const sig = request.artifact.signature;
  if (!isNonEmptyString(sig?.signature) || !isNonEmptyString(sig?.keyId)) {
    return { ok: false, reasonCode: "unsigned_policy", message: "Unsigned policy artifact cannot be loaded." };
  }
  if (!ctx.trustStore.isTrustedIssuer(sig.keyId) || !ctx.signatureVerifier.verify(request.artifact.astHash, sig)) {
    return { ok: false, reasonCode: "untrusted_or_invalid_signature", message: "Policy signature is untrusted or invalid." };
  }
  // Human approval is required to activate.
  if (!request.approval || request.approval.approverIsHuman !== true || !isNonEmptyString(request.approval.approvalId)) {
    return { ok: false, reasonCode: "activation_requires_human_approval", message: "Policy activation requires human approval." };
  }
  return { ok: true, reasonCode: "policy_activated", message: "Policy artifact activated and bound to its proposal + signature." };
}
