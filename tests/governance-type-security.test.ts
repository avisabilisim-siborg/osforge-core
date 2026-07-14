import type {
  TenantId,
  WorkspaceId,
  PrincipalId,
  DecisionId,
  PolicyId,
  CapabilityId,
  ApprovalId,
  PermitId,
  GovernanceDecision,
  ExecutionPermit
} from "../packages/governance/src/index.js";
import { tenantId, policyId } from "../packages/governance/src/index.js";

// Branded ids are not interchangeable.
const t: TenantId = tenantId("t1");
// @ts-expect-error a TenantId is not a WorkspaceId.
const w: WorkspaceId = t;
void w;

const p: PolicyId = policyId("p1");
// @ts-expect-error a PolicyId is not a CapabilityId.
const c: CapabilityId = p;
void c;

declare const pid: PrincipalId;
// @ts-expect-error a PrincipalId is not a DecisionId.
const d: DecisionId = pid;
void d;

declare const aid: ApprovalId;
// @ts-expect-error an ApprovalId is not a PermitId.
const permit: PermitId = aid;
void permit;

// A plain string cannot be a branded id.
// @ts-expect-error a raw string is not a TenantId.
const bad: TenantId = "t1";
void bad;

// A GovernanceDecision is deeply readonly — outcome cannot be reassigned.
declare const decision: GovernanceDecision;
// @ts-expect-error outcome is readonly.
decision.outcome = "ALLOW";

// An ExecutionPermit nonce is readonly.
declare const ep: ExecutionPermit;
// @ts-expect-error nonce is readonly.
ep.nonce = "x";
