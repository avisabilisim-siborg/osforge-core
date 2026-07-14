# Agent and Workload Identity

> Package: `packages/identity-trust` (`actors.ts`, `delegation.ts`) · Sprint P0.6 · Constitution §5, §20.

## Trust boundaries
Agents, digital employees, services, workloads and devices are first-class,
strictly-bounded principals. They are never implicitly trusted and never
self-escalate. SPIFFE-like principles, no dependency.

## Agent / digital-employee invariants
- Bound to a real owner + tenant; ownerless agents are denied.
- A human-readable purpose is mandatory.
- Cannot present as human; cannot change owner, widen scope, or raise trust/assurance.
- Cannot approve; cannot lift its own revocation.
- Agent identity is separate from model/provider identity (continuity across model
  changes); recreation does not auto-carry old credentials.
- A digital employee can never hold a privileged role.

## Service / workload invariants
- Never uses a human credential; must be instance-bound.
- Hostname, environment variables and IP are NOT identity; attestation is required.
- A terminated workload's credential is invalid.
- Workload identity links to build-artifact provenance (extension point).

## Device invariants
- A device is not the same identity as its user; loss can trigger revocation.
- Rooted/jailbroken/compromised states are modeled; trust decays; a new/unattested
  device requires step-up; device binding cannot exceed its tenant/workspace.

## Delegation / impersonation (agent-relevant)
- A delegate never exceeds the delegator; agents cannot delegate unbounded
  authority; delegation is bounded-depth, acyclic, expiring and audited.
- An impersonated or break-glass session can never delegate.
- An AI can never initiate impersonation or support access.

## Threat model
Ownerless agent, agent masquerading as human, owner replacement, agent
self-escalation, unbounded agent delegation, workload hostname/env/provenance
spoofing, terminated-workload reuse, compromised device.

## Human approval points
Critical delegation; impersonation (+ separate approval for sensitive data).

## Audit requirements
Delegation created/rejected and impersonation started are audited (dual-actor).

## Production adapter requirements
`WorkloadAttestationAdapter`, `DeviceAttestationAdapter`, `HardwareTrustAdapter`.

## 2035 extension points
Robot / autonomous-vehicle identity, federated AI-workforce identity,
inter-company digital-employee federation, multi-cloud workload identity.
