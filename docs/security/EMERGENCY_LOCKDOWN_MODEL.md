# Emergency Lockdown Model

> Package: `packages/hardening` (`emergency-lockdown.ts`) · Constitution §4 (lockdown), §5 (break-glass separate).

## Trust boundaries
Break-glass recovery and kill switch are separate models. An AI can neither
declare an emergency nor lift a lockdown. A global lockdown requires multiple
human approvals. Emergency mode narrows permissions and never loosens a security
control.

## Invariants
- Scopes: capability, connector, plugin, tenant, workspace, region, global.
- Emergency actions are short-lived (bounded expiry) and audited.
- Lockdown defaults to narrowing permissions.
- Returning to normal requires a separate human approval and verification.

## State machine
`NORMAL → (human declaration, global→multi-approval) → LOCKDOWN → RECOVERING →
(approval + verification) → NORMAL`.

## Threat model
AI-declared emergency, AI-lifted lockdown, emergency-mode privilege escalation,
unbounded lockdown, single-approval global lockdown.

## Failure modes
AI declaration/lift → REJECTED; global lockdown without enough approvals →
REQUIRES_MORE_APPROVAL; missing expiry → rejected.

## Human approval points
Declaration (human), global lockdown (multi-human), kill switch (human), and
return-to-normal (human approval + verification).

## Audit requirements
Every declaration, kill switch, and recovery is immutably audited.

## Production adapter requirements
A lockdown controller wired to runtime kill switches, revocation, and the
readiness gate; a multi-approval workflow.

## Rollback / recovery
Automatic expiry returns to normal only after verification; otherwise a human
recovery step is required.

## 2035 extension points
Region-wide lockdown, automated attack-triggered lockdown proposals (human-
confirmed), and graduated de-escalation build on the same authority/scope model.
