import type {
  ActiveSession,
  AgentPrincipal,
  CredentialId,
  HumanPrincipal,
  HumanSessionToken,
  IdentityEvidence,
  IdentityId,
  Principal,
  PrincipalId,
  ServiceToken,
  Session,
  SessionId,
  TenantId,
  VerifiedEvidence,
  VerifiedPrincipal,
  WorkspaceId
} from "../packages/identity-trust/src/index.js";
import { tenantId } from "../packages/identity-trust/src/index.js";

// A HUMAN principal is not an AGENT principal (discriminated by literal type).
declare const human: HumanPrincipal;
// @ts-expect-error HumanPrincipal cannot be used as AgentPrincipal.
const asAgent: AgentPrincipal = human;
void asAgent;

// A service token is not a human session token.
declare const svc: ServiceToken;
// @ts-expect-error ServiceToken cannot be used as HumanSessionToken.
const asHuman: HumanSessionToken = svc;
void asHuman;

// Branded ids are not interchangeable.
const t: TenantId = tenantId("t");
// @ts-expect-error TenantId is not a WorkspaceId.
const w: WorkspaceId = t;
void w;

declare const cid: CredentialId;
// @ts-expect-error CredentialId is not a SessionId.
const sid: SessionId = cid;
void sid;

declare const iid: IdentityId;
// @ts-expect-error IdentityId is not a PrincipalId.
const pid: PrincipalId = iid;
void pid;

// Unverified evidence cannot masquerade as verified evidence.
declare const rawEvidence: IdentityEvidence;
// @ts-expect-error unverified evidence is not VerifiedEvidence.
const ve: VerifiedEvidence = rawEvidence;
void ve;

// A plain session is not an active (verified-now) session.
declare const sess: Session;
// @ts-expect-error a plain session is not an ActiveSession.
const active: ActiveSession = sess;
void active;

// An unauthenticated principal is not a verified principal.
declare const plain: Principal;
// @ts-expect-error an unauthenticated principal is not a VerifiedPrincipal.
const verified: VerifiedPrincipal = plain;
void verified;
