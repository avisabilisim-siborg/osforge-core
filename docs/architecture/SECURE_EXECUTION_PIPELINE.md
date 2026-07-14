# Secure Execution Pipeline

> Package: `packages/pipeline` · Status: P0 Secure Spine · Governs: every execution path in OSForge.
> Constitution references: §2 Prime Directive, §4 Security, §7 Final Gate, §22 Explainability, §23 Audit.

The Secure Execution Pipeline is the one end-to-end spine through which every
request must pass before any executor runs. It composes the existing gates
(`edge-security`, `identity`, `policy`, `runtime-isolation`) with new pipeline
components (execution context, decision model, signed permit, replay
protection, approval gate, final gate, executor contract, immutable audit).

## Mandatory chain (no stage skippable)

```
Untrusted Input
  → Edge Validation        (ValidatedEdgeRequest brand required)
  → Identity Verification  (VerifiedIdentityContext brand required)
  → Tenant Context         (derived from validated OSForgeContext)
  → Workspace Context      (derived; never guessed)
  → Authorization          (#policy authorize → ALLOW)
  → Policy Evaluation      (#policy evaluatePolicies → ALLOW | REQUIRE_APPROVAL)
  → Approval Evaluation    (critical action / policy → human approval)
  → Replay Protection      (production store must be distributed + atomic)
  → Execution Permit       (serializable, HMAC-signed, one-time, context-bound)
  → Runtime Isolation      (#runtime-isolation boundary → ALLOWED)
  → Final Execution Gate   (re-verifies everything; mints authorization once)
  → Execution              (executor, only with a final-gate authorization)
  → Verification           (result must match permit + succeed)
  → Immutable Audit        (hash-chained envelope for every attempt)
```

## Sequence diagram

```text
Caller        Pipeline                         Gates / Stores                 Executor   Audit
  |  run(req)    |                                    |                           |         |
  |------------->| edge validated? --------------------> isValidatedEdgeRequest    |         |
  |              | identity verified? -----------------> isVerifiedIdentityContext |         |
  |              | build ExecutionContext (derive tenant/workspace)                |         |
  |              | authorize() ------------------------> #policy                   |         |
  |              | evaluatePolicies() -----------------> #policy                   |         |
  |              | evaluateApprovalGate() -------------> ApprovalStore.find        |         |
  |              | issuer.issue(permit) ----------------|  (HMAC + contextHash)    |         |
  |              | evaluateIsolationBoundary() --------> #runtime-isolation        |         |
  |              | evaluateFinalGate():                 |                           |         |
  |              |   verifyPermit + replayStore.claim + approvalStore.consume      |         |
  |              |   mint ExecutionAuthorization -------|                           |         |
  |              | runExecutor(auth, permit, ctx) -----------------------------> execute()   |
  |              | verify(result)                       |                           |         |
  |              | auditSink.append(envelope) --------------------------------------------->  |
  |<-------------| PipelineOutcome                      |                           |         |
```

## Trust boundaries

1. **Untrusted → Edge.** Raw input is untrusted; only a branded `ValidatedEdgeRequest` crosses inward.
2. **Edge → Identity.** Only a branded `VerifiedIdentityContext` proves authentication/MFA.
3. **Identity/Context agreement.** Edge, identity and `OSForgeContext` must bind to the same tenant/workspace/actor, or the request is denied.
4. **Decision → Permit.** Only the pipeline holds the `PermitIssuer` key; no orchestrator/agent can mint a permit.
5. **Permit → Execution.** Only the final gate can mint an `ExecutionAuthorization`; the executor is unreachable without it.

## Invariants

- **I1** No executor call happens without a valid final-gate authorization.
- **I2** A permit is bound to tenant, organization, workspace, actor, action, resource, and a context hash; any mismatch fails closed.
- **I3** A permit is single-use; a second consumption is a replay and is rejected.
- **I4** Critical actions never execute without a valid, single-use human approval whose approver is not the requester.
- **I5** Every attempt (allow, deny, pending, replay, context error, runtime rejection, execution, verification) is written to the immutable audit chain.
- **I6** Every security decision carries a reason code, human-readable reason, and next required action — never a bare boolean.
- **I7** Time comes only from a `TrustedClock`, never `Date.now()` directly.
- **I8** In production, test-only replay stores and audit sinks are refused; there is no "audit disabled" mode.

## Failure modes (all fail closed)

| Condition | Outcome |
| --- | --- |
| Edge not validated | `CONTEXT_INVALID` / audit `CONTEXT_ERROR` |
| Identity not verified / binding mismatch | `DENY` |
| Context missing/invalid | `CONTEXT_INVALID` |
| Authorization denied | `DENY` |
| Policy denied | `DENY` |
| Critical action, no approval | `APPROVAL_REQUIRED` |
| Approval present but weak step-up | `STEP_UP_REQUIRED` |
| Runtime isolation denied | `RUNTIME_REJECTED` |
| Permit expired/mutated/foreign | `RUNTIME_REJECTED` / `CONTEXT_INVALID` |
| Permit replayed | `RETRY_REJECTED` |
| Production with test-only store/sink | `RUNTIME_REJECTED` |

## Threat model (abridged)

- **Context/tenant spoofing** → branded edge+identity proofs, derived context, context-hash binding.
- **Permit forgery/tampering** → HMAC integrity marker, constant-time compare, key held only by the issuer.
- **Permit replay** → one-time nonce claim in a (production: distributed atomic) store.
- **Approval bypass / self-approval** → binding checks, human-only approver, requester≠approver, single-use consume.
- **Executor smuggling** → executor reachable only via a final-gate-minted branded authorization.
- **Silent action** → mandatory immutable audit; no disable path.
- **Clock manipulation** → single trusted-clock dependency; production requires an attested/trusted time source.

## Production adapter requirements

- Distributed, atomic `PermitReplayStore` (`testOnly === false`).
- Durable, append-only, tamper-evident `ImmutableAuditSink` (`testOnly === false`).
- `PermitIssuer` signing key from a managed secret store / KMS with rotation.
- A real `SecureExecutor` bound to `runtime-isolation` sandboxes (this sprint ships only the contract + a test executor).
- Replace the local `node-crypto.d.ts` shim with `@types/node` (dev-only types; no runtime change).

## Rollback plan

The pipeline is additive: it introduces `packages/pipeline` and new tests only,
and modifies no existing contract. To roll back, remove `packages/pipeline`, the
`tests/pipeline-*` files, and the one-line `tsconfig.type-tests.json` include.
No existing package, public export, or test is affected. Because nothing yet
consumes the pipeline in production, rollback carries no data-migration risk.
