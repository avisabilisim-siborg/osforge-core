# Identity & Trust Foundation

> Package: `packages/identity-trust` · Sprint P0.6 · Technology-neutral, contract-first, branded, fail-closed.
> Constitution: §2, §4, §5 (no AI self-escalation), §7, §22 (explainability), §23 (audit), §24. No vendor (Auth0/Keycloak/Firebase/Okta) dependency.

The common identity & trust spine for humans, admins, AI agents, digital
employees, services, devices, runtimes, connectors, plugins, MCP servers,
capabilities, edge nodes, robots and federated cloud identities. This layer
**identifies, verifies, evaluates trust and audits** — it does NOT make
business/authorization decisions (that is P0.7).

## Identity vs Principal
- **Identity**: the record of an entity.
- **Principal**: a verified actor in an operation context.
One identity may hold multiple controlled principal contexts, recorded and
audited via `IdentityBinding`. Authentication success alone is neither trust nor
authorization — the three are separate.

## Layer flow
```
Untrusted Request → Identity Context → Evidence Collection → Credential Verification
→ Principal Resolution → Tenant/Workspace Binding → Trust Evaluation → Session Validation
→ Identity Decision → Audit → (P0.7 Policy Engine)
```

## 1. Identity verification flow
```mermaid
flowchart TB
  IN[Untrusted request] --> EV[Collect evidence]
  EV --> VE{verifyEvidence\nissuer/validity/revocation/tenant}
  VE -- no --> R[(REJECTED — explained)]
  VE -- yes --> VC{verifyCredential\nexpiry/bind/scope/wildcard}
  VC -- no --> R
  VC -- yes --> PR{resolvePrincipal}
  PR -- no --> R
  PR -- yes --> TR{evaluateTrust}
  TR -- step-up --> SU[STEP_UP_REQUIRED]
  TR -- yes --> SE{verifySession}
  SE -- yes --> D[Identity Decision] --> AU[(Immutable audit)]
```

## 2. Principal resolution flow
```mermaid
flowchart LR
  P[Principal] --> K{known type?}
  K -- no --> X[UNKNOWN_TYPE]
  K -- yes --> S{status active & not deleted/revoked?}
  S -- no --> X2[REVOKED/DELETED]
  S -- yes --> E{unexpired?}
  E -- no --> X3[EXPIRED]
  E -- yes --> T{same tenant/workspace?}
  T -- no --> X4[TENANT_MISMATCH]
  T -- yes --> H{AI claiming human?}
  H -- yes --> X5[HUMAN_MASQUERADE]
  H -- no --> V[VerifiedPrincipal minted]
```

## 3. Credential lifecycle
```mermaid
stateDiagram-v2
  [*] --> issued
  issued --> active: bound to principal + tenant, expiry set
  active --> rotated: rotation (new id)
  active --> revoked: revocation
  active --> expired: TTL
  rotated --> revoked
  revoked --> [*]
  expired --> [*]
```
No plaintext is stored; expiry, rotation and revocation are mandatory; scope
cannot self-widen; wildcard is denied in production.

## 4. Session lifecycle
```mermaid
stateDiagram-v2
  [*] --> CREATED
  CREATED --> ACTIVE
  ACTIVE --> IDLE: inactivity
  ACTIVE --> STEP_UP_REQUIRED: privilege change / risk
  ACTIVE --> SUSPENDED
  ACTIVE --> REVOKED
  ACTIVE --> EXPIRED: absolute/expiry timeout
  IDLE --> ACTIVE: re-verify
  STEP_UP_REQUIRED --> ACTIVE: step-up
  REVOKED --> [*]
  EXPIRED --> [*]
  ACTIVE --> TERMINATED: rotation
```
Fixation and copy are denied; a tenant swap requires a new session; revoked/expired
sessions cannot be reused; session data holds no secrets.

## 5. Trust evaluation flow
```mermaid
flowchart TB
  EVI{verified evidence?} -- no --> EM[EVIDENCE_MISSING]
  EVI -- yes --> ISS{issuer/anchor trusted & not revoked?}
  ISS -- no --> IU[ISSUER_UNTRUSTED/REVOKED]
  ISS -- yes --> CY{chain acyclic?}
  CY -- no --> RJ[REJECTED cycle]
  CY -- yes --> TN{tenant & region match?}
  TN -- no --> MM[TENANT/CONTEXT_MISMATCH]
  TN -- yes --> AG{assurance ≥ required & fresh?}
  AG -- no --> SU[STEP_UP_REQUIRED]
  AG -- yes --> TRZ[TRUSTED]
```
`TrustScore`/`TrustLevel` are never an authorization result.

## 6. Delegation flow
```mermaid
flowchart LR
  D[Delegation] --> T{same tenant?}
  T -- no --> XC[CROSS_TENANT]
  T -- yes --> DP{depth ≤ max & acyclic?}
  DP -- no --> XD[DEPTH/CYCLE]
  DP -- yes --> SC{requested ⊆ delegator scope?}
  SC -- no --> XS[SCOPE_ESCALATION]
  SC -- yes --> CR{critical?}
  CR -- yes --> AP{human approval?}
  AP -- no --> XA[APPROVAL_REQUIRED]
  CR -- no --> G[GRANTED]
  AP -- yes --> G
```
Delegation is not impersonation; an agent cannot delegate unbounded authority.

## 7. Federation flow
```mermaid
flowchart LR
  A[External assertion] --> IS{issuer on allowlist & not revoked?}
  IS -- no --> XU[UNKNOWN_ISSUER/PROVIDER_REVOKED]
  IS -- yes --> MD{metadata valid?}
  MD -- no --> XM[METADATA_EXPIRED]
  MD -- yes --> AUD{audience match?}
  AUD -- no --> XA[AUDIENCE_MISMATCH]
  AUD -- yes --> TM{tenant mapping present?}
  TM -- no --> XT[TENANT_MAPPING_MISSING]
  TM -- yes --> RI{role/permission claim mapped?}
  RI -- no --> XR[ROLE_INJECTION_DENIED]
  RI -- yes --> OK[ACCEPTED]
```
External claims are never internal roles; account linking needs human verification.

## 8. Recovery flow
```mermaid
flowchart LR
  R[Recovery request] --> CH{high-assurance channel?}
  CH -- no --> XL[LOW_CHANNEL_DENIED]
  CH -- yes --> EV{single-use evidence unused?}
  EV -- no --> XE[EVIDENCE_REUSED]
  EV -- yes --> AP{human approvals ≥ required?}
  AP -- no --> XM[MULTI_APPROVAL_REQUIRED]
  AP -- yes --> OK[APPROVED → revoke sessions, limited assurance]
```
Recovery is not authentication; an AI cannot approve it.

## 9. Break-glass flow
```mermaid
flowchart LR
  B[Break-glass request] --> AI{human initiator?}
  AI -- no --> XA[AI_DENIED]
  AI -- yes --> RE{reason present?}
  RE -- no --> XR[NO_REASON]
  RE -- yes --> MA{human approvals ≥ (global:3/other:2)?}
  MA -- no --> XM[MULTI_APPROVAL_REQUIRED]
  MA -- yes --> EX{bounded & short-lived?}
  EX -- no --> XE[MUST_EXPIRE/TOO_LONG]
  EX -- yes --> G[GRANTED → post-use review, no delegation]
```
Break-glass is separate from normal credentials and from impersonation.

## 10. Agent / workload identity flow
```mermaid
flowchart LR
  AG[Agent identity] --> O{owner + tenant?}
  O -- no --> XO[OWNERLESS]
  O -- yes --> PU{human-readable purpose?}
  PU -- no --> XP[NO_PURPOSE]
  PU -- yes --> PR{not privileged?}
  PR -- no --> XPr[PRIVILEGED_DENIED]
  PR -- yes --> V[VALID]
  WL[Workload identity] --> INST{instance-bound + attested?}
  INST -- no --> XW[NOT_INSTANCE_BOUND/ATTESTATION_MISSING]
  INST -- yes --> VW[VALID]
```
An agent can never change its owner, widen scope, raise trust, approve, or present
as human. Model identity is separate from agent identity (identity continuity
across model/provider changes).

## Trust boundaries
Untrusted request → verified evidence → verified credential → resolved principal
→ trust decision → active session. Each boundary is fail-closed and explainable.
Nothing is implicitly trusted; no hidden privilege inheritance; no unaudited
impersonation; no permanent unrestricted credential.

## Threat model / failure modes
Every adversarial vector (cross-tenant access, credential/token misuse, replay,
session fixation/copy, assurance/agent self-escalation, unauthorized/looping
delegation, hidden impersonation, federation role injection, recovery/break-glass
abuse, audit tamper, test adapter in production) maps to a specific explained
rejection — see the security docs.

## Audit requirements
Immutable, hash-chained, per tenant/workspace, no secrets; impersonation is
dual-actor audited. ~19 event types.

## Production adapter requirements
Directory, credential verifier/issuer, session store, revocation store, federation
provider, device/workload attestation, passkey, CA, hardware-trust, human-
verification, audit adapters — all `assertProductionAdapter`-gated; reference
in-memory components are `testOnly`.

## 2035 extension points
Decentralized identity / verifiable credentials / passkeys / biometric proof refs
/ post-quantum credential signatures / TPM & secure-enclave attestation / robot &
autonomous-vehicle identity / federated AI-workforce identity / multi-cloud
workload identity / edge & offline verification / confidential-computing identity
/ sovereign identity zones / privacy-preserving & zero-knowledge credentials /
identity continuity across model/provider changes — all behind contracts, no core
change.

## Rollback plan
Additive: new `packages/identity-trust` + `tests/identity-*` + type-test include
+ `test:security` entries. The existing `packages/identity` gate and all public
APIs are untouched. Rollback = delete the new package, the new tests, and the two
config references.
