import type {
  SeamRef,
  AttestationRef,
  ProofRef,
  SeamAvailability,
  FutureSeam,
  FutureSeamName,
  QuantumReadySeam,
  ConfidentialComputingSeam,
  FederatedPolicySeam,
  RegionalPolicySeam,
  ZeroKnowledgeSeam,
  RemoteAttestationSeam,
  McpBoundarySeam,
  ProviderBoundarySeam
} from "../packages/future-extensions/src/index.js";

// Branded refs are not interchangeable.
declare const sr: SeamRef;
// @ts-expect-error a SeamRef is not an AttestationRef.
const ar: AttestationRef = sr;
void ar;
declare const at: AttestationRef;
// @ts-expect-error an AttestationRef is not a ProofRef.
const pr: ProofRef = at;
void pr;
// @ts-expect-error a plain string is not a SeamRef.
const bad: SeamRef = "s1";
void bad;

// Seam name / availability are closed unions.
const n: FutureSeamName = "MCP_BOUNDARY";
void n;
// @ts-expect-error "TIME_TRAVEL" is not a declared seam.
const tt: FutureSeamName = "TIME_TRAVEL";
void tt;
const av: SeamAvailability = "NOT_IMPLEMENTED";
void av;
// @ts-expect-error "ENABLED" is not a declared availability.
const en: SeamAvailability = "ENABLED";
void en;

// An availability carrier is not a boolean.
declare const avail: SeamAvailability;
// @ts-expect-error an availability is not a boolean.
const asBool: boolean = avail;
void asBool;

// Every seam: never authorizes, fail-closed when unavailable, not enabled today.
declare const seam: FutureSeam;
// @ts-expect-error `authorizes` is the literal false.
const seamAuth: FutureSeam["authorizes"] = true;
void seamAuth;
// @ts-expect-error `failClosedWhenUnavailable` is the literal true.
const failOpen: FutureSeam["failClosedWhenUnavailable"] = false;
void failOpen;
// @ts-expect-error `enabledToday` is the literal false.
const enabled: FutureSeam["enabledToday"] = true;
void enabled;
// @ts-expect-error a seam is readonly.
seam.name = "x";

// Quantum migration is additive and dual-signed.
declare const q: QuantumReadySeam;
// @ts-expect-error `migrationIsAdditive` is the literal true.
const destructive: QuantumReadySeam["migrationIsAdditive"] = false;
void destructive;
// @ts-expect-error `dualSignatureDuringMigration` is the literal true.
const single: QuantumReadySeam["dualSignatureDuringMigration"] = false;
void single;
void q;

// Confidential computing requires attestation and only reduces exposure.
declare const cc: ConfidentialComputingSeam;
// @ts-expect-error `requiresRemoteAttestation` is the literal true.
const noAttest: ConfidentialComputingSeam["requiresRemoteAttestation"] = false;
void noAttest;
// @ts-expect-error `reducesExposureOnly` is the literal true.
const becomesAuthority: ConfidentialComputingSeam["reducesExposureOnly"] = false;
void becomesAuthority;
void cc;

// Federated policy can only narrow and never crosses a tenant.
declare const fed: FederatedPolicySeam;
// @ts-expect-error `canOnlyNarrow` is the literal true.
const widens: FederatedPolicySeam["canOnlyNarrow"] = false;
void widens;
// @ts-expect-error `crossesTenantBoundary` is the literal false.
const crosses: FederatedPolicySeam["crossesTenantBoundary"] = true;
void crosses;
// @ts-expect-error `localGovernanceDecides` is the literal true.
const remoteDecides: FederatedPolicySeam["localGovernanceDecides"] = false;
void remoteDecides;
void fed;

// Region movement is never implicit; unknown region denied.
declare const reg: RegionalPolicySeam;
// @ts-expect-error `implicitRegionMovement` is the literal false.
const implicitMove: RegionalPolicySeam["implicitRegionMovement"] = true;
void implicitMove;
// @ts-expect-error `unknownRegionIsDenied` is the literal true.
const unknownOk: RegionalPolicySeam["unknownRegionIsDenied"] = false;
void unknownOk;
void reg;

// A ZK proof never grants access.
declare const zk: ZeroKnowledgeSeam;
// @ts-expect-error `grantsAccess` is the literal false.
const grants: ZeroKnowledgeSeam["grantsAccess"] = true;
void grants;
// @ts-expect-error `unverifiedProofRejected` is the literal true.
const acceptsUnverified: ZeroKnowledgeSeam["unverifiedProofRejected"] = false;
void acceptsUnverified;
void zk;

// Attestation proves integrity, never authority.
declare const ra: RemoteAttestationSeam;
// @ts-expect-error `conferAuthority` is the literal false.
const confers: RemoteAttestationSeam["conferAuthority"] = true;
void confers;
// @ts-expect-error `freshnessRequired` is the literal true.
const stale: RemoteAttestationSeam["freshnessRequired"] = false;
void stale;
void ra;

// MCP output is untrusted data and can never mint a capability or instruct.
declare const mcp: McpBoundarySeam;
// @ts-expect-error `outputIsUntrusted` is the literal true.
const mcpTrusted: McpBoundarySeam["outputIsUntrusted"] = false;
void mcpTrusted;
// @ts-expect-error `canMintCapability` is the literal false.
const mints: McpBoundarySeam["canMintCapability"] = true;
void mints;
// @ts-expect-error `outputCanBecomeInstruction` is the literal false.
const instructs: McpBoundarySeam["outputCanBecomeInstruction"] = true;
void instructs;
void mcp;

// A provider is untrusted; identity never conflates; fallback never downgrades.
declare const prov: ProviderBoundarySeam;
// @ts-expect-error `providerIdentityIsAgentIdentity` is the literal false.
const sameIdentity: ProviderBoundarySeam["providerIdentityIsAgentIdentity"] = true;
void sameIdentity;
// @ts-expect-error `fallbackMayLowerControls` is the literal false.
const downgrade: ProviderBoundarySeam["fallbackMayLowerControls"] = true;
void downgrade;
// @ts-expect-error `canApprove` is the literal false.
const approves: ProviderBoundarySeam["canApprove"] = true;
void approves;
// @ts-expect-error `lineageRecorded` is the literal true.
const noLineage: ProviderBoundarySeam["lineageRecorded"] = false;
void noLineage;
void prov;
