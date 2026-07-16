import type {
  TenantId,
  OrganizationId,
  WorkspaceId,
  ActorId,
  TenantAuditRef,
  TenantLifecycleState,
  IsolationStatus,
  CrossTenantStatus,
  TenantDecision
} from "../packages/tenant-boundary/src/index.js";
import { tenantId } from "../packages/tenant-boundary/src/index.js";

// Branded ids are not interchangeable.
const tid: TenantId = tenantId("t1");
// @ts-expect-error a TenantId is not an OrganizationId.
const o: OrganizationId = tid;
void o;
// @ts-expect-error a TenantId is not a WorkspaceId.
const w: WorkspaceId = tid;
void w;

declare const aid: ActorId;
// @ts-expect-error an ActorId is not a TenantAuditRef.
const ar: TenantAuditRef = aid;
void ar;

// @ts-expect-error a plain string is not a TenantId.
const bad: TenantId = "t1";
void bad;

// Lifecycle is a closed union.
const st: TenantLifecycleState = "SUSPENDED";
void st;
// @ts-expect-error "DELETED" is not a tenant lifecycle state.
const badSt: TenantLifecycleState = "DELETED";
void badSt;

// Isolation status is a closed union — no bare ALLOW (the boundary never authorizes).
const ok: IsolationStatus = "SCOPE_VALID";
void ok;
// @ts-expect-error "ALLOW" is not an isolation status — the boundary never authorizes.
const allow: IsolationStatus = "ALLOW";
void allow;
// @ts-expect-error "GRANTED" is not a cross-tenant status.
const granted: CrossTenantStatus = "GRANTED";
void granted;

// A status carrier is not a boolean.
declare const status: IsolationStatus;
// @ts-expect-error a status is not a boolean.
const asBool: boolean = status;
void asBool;

// A tenant decision has no authorization fields.
declare const decision: TenantDecision<IsolationStatus>;
// @ts-expect-error a tenant decision has no `permit` field.
const permit = decision.permit;
void permit;
// @ts-expect-error a tenant decision has no `allow` field.
const al = decision.allow;
void al;

void tid;
