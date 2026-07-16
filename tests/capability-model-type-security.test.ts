import type {
  CapabilityId,
  CapabilityGrantId,
  CapabilityTokenId,
  CapabilityAuditRef,
  CapabilityToken,
  CapabilityGrant,
  CapabilityDelegation,
  CapabilityExpiration,
  CapabilityRevocation,
  CapabilityGrantStatus,
  CapabilityTokenStatus
} from "../packages/capability-model/src/index.js";

// Branded ids are not interchangeable.
declare const cid: CapabilityId;
// @ts-expect-error a CapabilityId is not a CapabilityGrantId.
const g: CapabilityGrantId = cid;
void g;
declare const gid: CapabilityGrantId;
// @ts-expect-error a CapabilityGrantId is not a CapabilityTokenId.
const t: CapabilityTokenId = gid;
void t;
declare const tid: CapabilityTokenId;
// @ts-expect-error a CapabilityTokenId is not a CapabilityAuditRef.
const ar: CapabilityAuditRef = tid;
void ar;
// @ts-expect-error a plain string is not a CapabilityId.
const bad: CapabilityId = "c1";
void bad;

// Statuses are closed unions with no bare ALLOW.
const gs: CapabilityGrantStatus = "GRANT_REVOKED";
void gs;
// @ts-expect-error "ALLOW" is not a grant status — a capability never authorizes.
const allow: CapabilityGrantStatus = "ALLOW";
void allow;
// @ts-expect-error "AUTHORIZED" is not a token status.
const auth: CapabilityTokenStatus = "AUTHORIZED";
void auth;

// A status carrier is not a boolean.
declare const status: CapabilityGrantStatus;
// @ts-expect-error a status is not a boolean.
const asBool: boolean = status;
void asBool;

// A token is evidence, never an authorization — `authorizes` is the literal false.
declare const token: CapabilityToken;
// @ts-expect-error `authorizes` is the literal false and can never be true.
const authorizes: CapabilityToken["authorizes"] = true;
void authorizes;
// @ts-expect-error `singleUse` is the literal true.
const multi: CapabilityToken["singleUse"] = false;
void multi;
// @ts-expect-error a token is readonly.
token.nonce = "x";
// @ts-expect-error a token carries no `permit` field.
const permit = token.permit;
void permit;

// A grant is readonly and carries no permit.
declare const grant: CapabilityGrant;
// @ts-expect-error a grant is readonly.
grant.revoked = false;
// @ts-expect-error a grant carries no `permit` field.
const gp = grant.permit;
void gp;

// An expiry can never be extended by the holder.
declare const exp: CapabilityExpiration;
// @ts-expect-error `extendableByHolder` is the literal false.
const extendable: CapabilityExpiration["extendableByHolder"] = true;
void extendable;
void exp;

// A revocation is never reversible by the holder.
declare const rev: CapabilityRevocation;
// @ts-expect-error `reversibleByHolder` is the literal false.
const reversible: CapabilityRevocation["reversibleByHolder"] = true;
void reversible;
void rev;

// A delegation is readonly.
declare const del: CapabilityDelegation;
// @ts-expect-error a delegation is readonly.
del.toActor = "x";
