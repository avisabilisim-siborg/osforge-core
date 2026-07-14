# Policy Compilation Boundary

> Package: `packages/hardening` (`policy-compilation.ts`) · Constitution §5 (AI), §4 (policy). No real NL compiler is built.

## Trust boundaries
Natural-language proposal → parsed AST → static validation → conflict detection →
human review → signed artifact → runtime policy. An AI may only draft; it can
never activate. Runtime policy is bound to its proposal and signature.

## Invariants
- Compilation is deterministic (a stable AST hash over canonical rules).
- Ambiguous proposals are rejected; conflicting rules fail closed.
- No unsigned policy artifact is loaded.
- Activation requires human approval.

## State machine
`proposal → compile(COMPILED|AMBIGUOUS|REJECTED) → validate(VALID|CONFLICTING) →
human review → sign → activate(signature + approval) → runtime`.

## Threat model
AI self-activating policy, ambiguous/conflicting policy, unsigned/tampered policy
artifact, activation without review.

## Failure modes
AMBIGUOUS/CONFLICTING/unsigned/untrusted/no-approval → activation refused.

## Human approval points
Human review of the AST and human approval of activation are mandatory.

## Audit requirements
Proposal, compilation result, conflicts, signature and activation are audited.

## Production adapter requirements
A deterministic policy compiler, a policy signing service, and a review workflow.

## Rollback / recovery
Deactivate the policy artifact; revert to the prior signed policy version.

## 2035 extension points
Richer policy languages, formal verification of policy sets, and multi-party
policy signing extend the same proposal→AST→signed-artifact pipeline.
