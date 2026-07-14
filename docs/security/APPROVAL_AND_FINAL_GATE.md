# Approval and Final Execution Gate

> Package: `packages/pipeline` (`approval-gate.ts`, `final-gate.ts`) · Constitution §6, §7.

## Approval gate

Critical actions MUST NOT execute without an explicit, valid, single-use human
approval. The critical set (`CRITICAL_ACTIONS`) is a superset of the protocol
`CriticalActionType`:

```
payment, refund, data_deletion, permission_change, bulk_message,
customer_data_export, secret_management, plugin_connection, mcp_connection,
production_change, break_glass, irreversible_action
```

Approval is also required when policy returns `REQUIRE_APPROVAL`, even for a
non-critical action.

### ApprovalReference bindings

An approval is valid only if it matches the request on **actor, tenant,
workspace, action, and scope**, is **not expired**, is **single-use**, was
granted by a **human approver who is not the requester**, and meets the required
**step-up level**.

| Reason code | Result |
| --- | --- |
| `approval_missing` | `APPROVAL_REQUIRED` |
| `approval_binding_mismatch` | `DENY` |
| `approval_not_single_use` | `DENY` |
| `approver_not_human` | `DENY` (an AI agent/digital employee can never approve) |
| `approver_is_requester` | `DENY` (no self-approval) |
| `approval_expired` | `DENY` |
| `step_up_required` | `STEP_UP_REQUIRED` |
| `approval_valid` | `ALLOW` |

Validity is decided in the approval gate; **consumption** (single-use burn)
happens later, at the final gate, so a denial never spends an approval.

## Final execution gate

The final gate is the single, central checkpoint before the executor. It
re-verifies — it does not trust earlier stages blindly:

1. Every prior decision is `ALLOW` (else `prior_decision_not_allowed`).
2. The replay store is production-safe for the mode (else `replay_store_not_production_safe`).
3. Runtime isolation was allowed (else `runtime_isolation_denied`).
4. The permit is intact, unexpired, and bound to this exact context (else the permit reason code).
5. The one-time permit nonce is claimed (replay → `permit_replayed`).
6. The required approval is consumed single-use (else `approval_consumption_failed`).

Only then does it mint an `ExecutionAuthorization` — a branded token created
**exclusively** by the final gate (the mint function is never exported from the
package index). The executor guard (`runExecutor` / `assertExecutionAuthorization`)
rejects any call whose authorization was not minted here.

## Invariants

- **F1** No execution authorization exists without passing the full final gate.
- **F2** The final gate consumes the permit nonce and the approval atomically with granting; a replay or already-consumed approval denies.
- **F3** A forged or absent authorization cannot drive the executor.
- **F4** The requester and approver are always distinct identities; the approver is always human.

## Threat model

- **Approval replay** → single-use consume in the approval store.
- **Approval forgery / re-scope** → binding checks on actor/tenant/workspace/action/scope.
- **Self-approval / AI approval** → requester≠approver and human-only approver.
- **Gate bypass / executor smuggling** → branded authorization minted only here.
- **Downgrade** → step-up level enforced; critical action always requires approval.

## Production adapter requirements

- Approval store backed by durable storage with atomic single-use consumption.
- Approver identity proven by the identity gate (human, phishing-resistant MFA for high-risk classes).
- Step-up levels mapped to real AAL2/AAL3 challenges.

## Rollback plan

Both modules are new and only used by the pipeline. Removing the pipeline
package removes them with no impact on existing contracts or tests.
