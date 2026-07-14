# Execution Permit Model

> Package: `packages/pipeline` (`permit.ts`) · Constitution §4, §7, §8.

The pipeline's `SignedExecutionPermit` is a **serializable, single-use,
short-lived** grant of one specific execution. It is distinct from the in-process
branded permits in `#policy` and `#runtime-isolation`: it does NOT rely on a
`WeakSet` or process memory, so it can be persisted, transported, and verified
after a process restart.

## Structure

```
SignedExecutionPermit
├─ claims (ExecutionPermitClaims)
│   permitId, requestId, correlationId,
│   actorId, actorType, tenantId, organizationId, workspaceId,
│   action, resource{id,type},
│   issuedAt, expiresAt, nonce, keyId,
│   policyDecisionId, approvalReference?, runtimeConstraints, contextHash
├─ algorithm: "HMAC-SHA256"
└─ integrity: HMAC-SHA256(secret, canonicalJson(claims))
```

- **Integrity marker.** `integrity` is an HMAC over the canonical (sorted-key)
  JSON of the claims. Verification recomputes it with the signing key and
  compares in constant time. Any change to any claim invalidates the permit.
- **Serializable & restart-safe.** `serializePermit` / `deserializePermit`
  round-trip the permit as JSON. Verification needs only the signing key — no
  in-memory state — so a restarted process (or another node) with the same key
  can verify a permit it did not issue.
- **Context binding.** `contextHash` is a SHA-256 over the security-relevant
  fields of the `ExecutionContext`. If the context mutates between issuance and
  the final gate, verification fails with `context_mutation_detected`.

## Invariants

- **P1** Only a `PermitIssuer` (holding the signing key) can produce a valid permit. The key is never given to an orchestrator or agent.
- **P2** A permit verifies only against matching tenant, organization, workspace, actor, action, resource, and context hash.
- **P3** A permit past `expiresAt` is rejected (stale-timestamp defense).
- **P4** A permit is single-use; the nonce is claimed exactly once (see the replay model).
- **P5** A permit signed with a different key is rejected.
- **P6** `permitReference` (a hash of permitId + integrity) is used in audit records; the signing secret is never logged.

## Failure modes

| Reason code | Meaning |
| --- | --- |
| `permit_malformed` | Not a well-formed signed permit. |
| `permit_integrity_invalid` | HMAC mismatch (tampered or wrong key). |
| `permit_expired` | `expiresAt` is not in the future. |
| `permit_tenant_mismatch` / `_organization_` / `_workspace_` / `_actor_` / `_action_` / `_resource_` | Binding does not match the current context. |
| `context_mutation_detected` | Context hash changed after issuance. |

## Threat model

- **Forgery** — infeasible without the signing key (HMAC-SHA256).
- **Tampering** — any claim edit breaks the integrity marker.
- **Cross-tenant / cross-workspace reuse** — binding checks reject it.
- **Stale replay** — expiry + one-time nonce.
- **Secret exposure** — the secret lives only inside `PermitIssuer` (private field); audit stores a hash, not the permit body.

## Production adapter requirements

- Signing key from a managed secret store / KMS, rotated on a schedule; support
  multiple `keyId`s during rotation (verify against the key named in the claim).
- Short TTLs (seconds–minutes) tuned to the action class.
- Consider per-tenant signing keys to bound blast radius.

## Rollback plan

`permit.ts` is new and consumed only by the pipeline. Removing the pipeline
package removes the permit model with no effect on existing contracts.
