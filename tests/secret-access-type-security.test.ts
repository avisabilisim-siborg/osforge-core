import type {
  TenantId,
  WorkspaceId,
  ActorId,
  SecretRef,
  LeaseId,
  SecretPermitRef,
  PlaintextSecret,
  SecretHandle,
  AccessStatus,
  SecretSensitivity
} from "../packages/secret-access/src/index.js";
import { secretRef, tenantId } from "../packages/secret-access/src/index.js";

// Branded ids are not interchangeable.
const tid: TenantId = tenantId("t1");
// @ts-expect-error a TenantId is not a WorkspaceId.
const w: WorkspaceId = tid;
void w;

declare const aid: ActorId;
// @ts-expect-error an ActorId is not a SecretRef.
const sr: SecretRef = aid;
void sr;

declare const lid: LeaseId;
// @ts-expect-error a LeaseId is not a SecretPermitRef.
const pr: SecretPermitRef = lid;
void pr;

// A raw string is not a branded SecretRef.
// @ts-expect-error a plain string is not a SecretRef.
const badRef: SecretRef = "s1";
void badRef;

// ---- The core plaintext ban ----
// A plain string cannot be constructed as a PlaintextSecret.
// @ts-expect-error a plain string is not a PlaintextSecret.
const pt: PlaintextSecret = "hunter2";
void pt;

// A plain string is not assignable to a SecretHandle (the handle carries no value).
// @ts-expect-error a plain string is not a SecretHandle.
const badHandle: SecretHandle = "hunter2";
void badHandle;

// A SecretHandle exposes no `value` property.
declare const handle: SecretHandle;
// @ts-expect-error a handle has no readable value property.
const leaked: string = handle.value;
void leaked;

// `use` yields a PlaintextSecret, not a plain string that can escape by assignment.
handle.use((v: PlaintextSecret) => {
  // @ts-expect-error a PlaintextSecret is intentionally not a plain assignable string target here.
  const escape: PlaintextSecret = "other";
  void escape;
  return v.length;
});

// SecretSensitivity is a closed union.
const good: SecretSensitivity = "CRITICAL";
void good;
// @ts-expect-error "ULTRA" is not a known sensitivity.
const bad: SecretSensitivity = "ULTRA";
void bad;

// AccessStatus is a string-literal union carrier, not a boolean.
declare const status: AccessStatus;
// @ts-expect-error a status is not a boolean.
const asBool: boolean = status;
void asBool;

// A valid branded SecretRef still constructs via the constructor.
const okRef: SecretRef = secretRef("s1");
void okRef;
void tid;
