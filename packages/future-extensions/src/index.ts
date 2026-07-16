/**
 * OSForge Future Extension Contracts (PR-L). **CONTRACTS / INTERFACES ONLY — no
 * implementation, and deliberately NOT enabled.**
 *
 * Technology-neutral, vendor-independent, fail-closed. Declares the 2035/2070 extension
 * SEAMS the architecture reserves: quantum-ready cryptography, confidential computing,
 * federated policy, regional policy, zero-knowledge proofs, remote attestation, the MCP
 * boundary and the provider boundary. Each is an adapter PORT a future deployment may
 * implement — **none is bound, wired, or enabled here** (ADR 0022 §3 horizon-aware rule:
 * horizon capabilities are seams, not ahead-of-sprint implementations).
 *
 * Universal rules for every seam declared in this package:
 *  - It NEVER produces an authorization (no permit/capability/approval/ALLOW type).
 *  - It is UNAVAILABLE by default; an unimplemented seam is fail-closed, never assumed safe.
 *  - An unverified/unattested result is UNTRUSTED — absence of proof is never proof.
 *  - No external system (MCP server, provider, federated peer, attestor) is ever trusted
 *    by default (Constitution §2 P2.4).
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type SeamRef = Brand<string, "SeamRef">;
export type AttestationRef = Brand<string, "AttestationRef">;
export type ProofRef = Brand<string, "ProofRef">;

/** Every future seam declares its availability. Default is NOT_IMPLEMENTED (fail-closed). */
export type SeamAvailability = "NOT_IMPLEMENTED" | "EXPERIMENTAL" | "AVAILABLE" | "DEPRECATED";

/** The common shape every future seam shares. */
export interface FutureSeam {
  readonly seamRef: SeamRef;
  readonly name: string;
  readonly availability: SeamAvailability;
  /** No seam ever authorizes; governance remains the sole authority (ADR 0017). */
  readonly authorizes: false;
  /** An unimplemented seam is fail-closed, never treated as safe. */
  readonly failClosedWhenUnavailable: true;
  /** Nothing in this package is enabled today. */
  readonly enabledToday: false;
}

// ---- 1. Quantum Ready ----
/** Post-quantum algorithms are reserved, not selected; migration is additive + dual-signed. */
export type PqAlgorithmClass = "PQ_SIGNATURE_RESERVED" | "PQ_KEM_RESERVED" | "PQ_HASH_RESERVED" | "CLASSICAL_ONLY";

export interface QuantumReadySeam extends FutureSeam {
  readonly algorithmClass: PqAlgorithmClass;
  /** Migration keeps classical signatures valid; it never invalidates existing audit. */
  readonly migrationIsAdditive: true;
  /** During migration both classical and PQ anchors are produced. */
  readonly dualSignatureDuringMigration: true;
}

export type QuantumReadyStatus = "PQ_NOT_IMPLEMENTED" | "PQ_DUAL_SIGNED" | "PQ_ONLY" | "PQ_ALGORITHM_UNKNOWN" | "PQ_MIGRATION_INCOMPLETE";

// ---- 2. Confidential Computing ----
/** Execution inside a hardware-isolated enclave. Absence of attestation ⇒ untrusted. */
export interface ConfidentialComputingSeam extends FutureSeam {
  readonly enclaveKind: "TEE_RESERVED" | "SEV_RESERVED" | "TDX_RESERVED" | "NONE";
  /** An enclave claim is worthless without a verified remote attestation. */
  readonly requiresRemoteAttestation: true;
  /** An enclave never becomes an authority; it only reduces exposure. */
  readonly reducesExposureOnly: true;
}

export type ConfidentialComputingStatus = "CC_NOT_IMPLEMENTED" | "CC_ATTESTED" | "CC_ATTESTATION_MISSING" | "CC_ATTESTATION_INVALID" | "CC_ENCLAVE_UNKNOWN";

// ---- 3. Federated Policy ----
/**
 * Policy exchange across OSForge nodes/organizations. A federated peer is NEVER trusted by
 * default; a remote policy can only NARROW local policy, never widen it, and never crosses
 * a tenant boundary.
 */
export interface FederatedPolicySeam extends FutureSeam {
  readonly peerRef: string;
  readonly peerTrusted: boolean;
  /** A remote policy may only narrow the local decision. */
  readonly canOnlyNarrow: true;
  /** Federation never crosses a tenant boundary. */
  readonly crossesTenantBoundary: false;
  /** A federated decision is evidence; local governance still decides. */
  readonly localGovernanceDecides: true;
}

export type FederatedPolicyStatus =
  | "FED_NOT_IMPLEMENTED"
  | "FED_PEER_UNTRUSTED"
  | "FED_NARROWED"
  | "FED_WIDENING_DENIED"
  | "FED_CROSS_TENANT_DENIED"
  | "FED_PEER_UNREACHABLE";

// ---- 4. Regional Policy ----
/** Sovereign region / residency zones. Cross-region movement is never implicit. */
export interface RegionalPolicySeam extends FutureSeam {
  readonly regionRef: string;
  readonly residencyEnforced: true;
  /** Data never changes region without an explicit policy. */
  readonly implicitRegionMovement: false;
  /** An unknown region is fail-closed, never a default. */
  readonly unknownRegionIsDenied: true;
}

export type RegionalPolicyStatus = "REGION_NOT_IMPLEMENTED" | "REGION_OK" | "REGION_UNKNOWN_DENIED" | "REGION_EGRESS_DENIED" | "REGION_POLICY_MISSING";

// ---- 5. Zero Knowledge ----
/** Prove a property without revealing the data. An unverified proof is worthless. */
export interface ZeroKnowledgeSeam extends FutureSeam {
  readonly proofSystem: "ZK_SNARK_RESERVED" | "ZK_STARK_RESERVED" | "NONE";
  /** A proof attests a property; it never grants access. */
  readonly grantsAccess: false;
  /** An unverified proof is rejected — absence of proof is never proof. */
  readonly unverifiedProofRejected: true;
}

export type ZeroKnowledgeStatus = "ZK_NOT_IMPLEMENTED" | "ZK_PROOF_VERIFIED" | "ZK_PROOF_INVALID" | "ZK_PROOF_MISSING" | "ZK_SYSTEM_UNKNOWN";

// ---- 6. Remote Attestation ----
/** Attest a remote runtime's identity/integrity. Unattested ⇒ untrusted, never assumed. */
export interface RemoteAttestationSeam extends FutureSeam {
  readonly attestorRef: string;
  readonly measurementRef: string;
  /** A stale attestation is refused; freshness is mandatory. */
  readonly freshnessRequired: true;
  /** Attestation proves integrity, never authority. */
  readonly conferAuthority: false;
}

export type RemoteAttestationStatus =
  | "ATTEST_NOT_IMPLEMENTED"
  | "ATTEST_VERIFIED"
  | "ATTEST_STALE"
  | "ATTEST_MEASUREMENT_MISMATCH"
  | "ATTEST_ATTESTOR_UNKNOWN"
  | "ATTEST_MISSING";

// ---- 7. MCP Boundary ----
/**
 * The seam for future MCP servers. An MCP server is an UNTRUSTED external system: its
 * output is data, never instruction (ADR 0021), it must be registered + signed +
 * identity-verified + tenant-scoped + revocable, and it can never mint a capability.
 * Composes — does not redefine — the frozen tool-firewall connector contract (ADR 0016).
 */
export interface McpBoundarySeam extends FutureSeam {
  readonly serverRef: string;
  readonly registered: boolean;
  readonly signatureVerified: boolean;
  readonly identityVerified: boolean;
  readonly revoked: boolean;
  /** MCP output is untrusted content, always. */
  readonly outputIsUntrusted: true;
  /** An MCP server can never mint a capability or approve. */
  readonly canMintCapability: false;
  /** MCP output can never become an instruction without content-trust promotion. */
  readonly outputCanBecomeInstruction: false;
  readonly tenantScoped: true;
}

export type McpBoundaryStatus =
  | "MCP_NOT_IMPLEMENTED"
  | "MCP_ADMITTED_AS_DATA"
  | "MCP_UNREGISTERED_DENIED"
  | "MCP_UNSIGNED_DENIED"
  | "MCP_IDENTITY_MISMATCH"
  | "MCP_REVOKED"
  | "MCP_CROSS_TENANT_DENIED"
  | "MCP_INSTRUCTION_DENIED";

// ---- 8. Provider Boundary ----
/**
 * The seam for future model/LLM providers. A provider is UNTRUSTED: its output is a
 * proposal, never authority (ADR 0018). Provider identity is separate from agent
 * identity; a model switch/fallback can never lower a security control.
 */
export interface ProviderBoundarySeam extends FutureSeam {
  readonly providerRef: string;
  readonly modelRef: string;
  /** Provider identity is never the agent's identity. */
  readonly providerIdentityIsAgentIdentity: false;
  /** Model output is an untrusted proposal. */
  readonly outputIsUntrusted: true;
  /** A fallback/switch never lowers a control (no silent downgrade). */
  readonly fallbackMayLowerControls: false;
  /** A provider can never approve, mint a capability, or issue a permit. */
  readonly canApprove: false;
  readonly tenantScoped: true;
  /** Provenance of the model/lineage is recorded for audit. */
  readonly lineageRecorded: true;
}

export type ProviderBoundaryStatus =
  | "PROVIDER_NOT_IMPLEMENTED"
  | "PROVIDER_OUTPUT_AS_PROPOSAL"
  | "PROVIDER_UNREGISTERED_DENIED"
  | "PROVIDER_FALLBACK_DOWNGRADE_DENIED"
  | "PROVIDER_IDENTITY_CONFUSION_DENIED"
  | "PROVIDER_CROSS_TENANT_DENIED";

// ---- Declared catalogs (declaration only, no logic) ----
export type FutureSeamName =
  | "QUANTUM_READY"
  | "CONFIDENTIAL_COMPUTING"
  | "FEDERATED_POLICY"
  | "REGIONAL_POLICY"
  | "ZERO_KNOWLEDGE"
  | "REMOTE_ATTESTATION"
  | "MCP_BOUNDARY"
  | "PROVIDER_BOUNDARY";

export const FUTURE_SEAMS: readonly FutureSeamName[] = Object.freeze([
  "QUANTUM_READY",
  "CONFIDENTIAL_COMPUTING",
  "FEDERATED_POLICY",
  "REGIONAL_POLICY",
  "ZERO_KNOWLEDGE",
  "REMOTE_ATTESTATION",
  "MCP_BOUNDARY",
  "PROVIDER_BOUNDARY"
]);

export const SEAM_AVAILABILITIES: readonly SeamAvailability[] = Object.freeze(["NOT_IMPLEMENTED", "EXPERIMENTAL", "AVAILABLE", "DEPRECATED"]);

/** The default availability of every seam declared here: nothing is enabled today. */
export const DEFAULT_SEAM_AVAILABILITY: SeamAvailability = "NOT_IMPLEMENTED";

/**
 * The fail-closed status of every seam when unimplemented. A conformance test asserts each
 * seam declares an explicit NOT_IMPLEMENTED status — an unimplemented seam is never safe.
 */
export const SEAM_NOT_IMPLEMENTED_STATUSES: readonly string[] = Object.freeze([
  "PQ_NOT_IMPLEMENTED",
  "CC_NOT_IMPLEMENTED",
  "FED_NOT_IMPLEMENTED",
  "REGION_NOT_IMPLEMENTED",
  "ZK_NOT_IMPLEMENTED",
  "ATTEST_NOT_IMPLEMENTED",
  "MCP_NOT_IMPLEMENTED",
  "PROVIDER_NOT_IMPLEMENTED"
]);

/** Statuses an implementation MUST treat as denying across every seam. */
export const FUTURE_SEAM_FAIL_CLOSED_STATUSES: readonly string[] = Object.freeze([
  "PQ_ALGORITHM_UNKNOWN",
  "PQ_MIGRATION_INCOMPLETE",
  "CC_ATTESTATION_MISSING",
  "CC_ATTESTATION_INVALID",
  "CC_ENCLAVE_UNKNOWN",
  "FED_PEER_UNTRUSTED",
  "FED_WIDENING_DENIED",
  "FED_CROSS_TENANT_DENIED",
  "FED_PEER_UNREACHABLE",
  "REGION_UNKNOWN_DENIED",
  "REGION_EGRESS_DENIED",
  "REGION_POLICY_MISSING",
  "ZK_PROOF_INVALID",
  "ZK_PROOF_MISSING",
  "ZK_SYSTEM_UNKNOWN",
  "ATTEST_STALE",
  "ATTEST_MEASUREMENT_MISMATCH",
  "ATTEST_ATTESTOR_UNKNOWN",
  "ATTEST_MISSING",
  "MCP_UNREGISTERED_DENIED",
  "MCP_UNSIGNED_DENIED",
  "MCP_IDENTITY_MISMATCH",
  "MCP_REVOKED",
  "MCP_CROSS_TENANT_DENIED",
  "MCP_INSTRUCTION_DENIED",
  "PROVIDER_UNREGISTERED_DENIED",
  "PROVIDER_FALLBACK_DOWNGRADE_DENIED",
  "PROVIDER_IDENTITY_CONFUSION_DENIED",
  "PROVIDER_CROSS_TENANT_DENIED"
]);
