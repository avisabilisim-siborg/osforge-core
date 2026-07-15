/**
 * OSForge Secret Access Boundary (P0.8 Sprint 12 / Roadmap Sprint 12, ADR 0015 step 8,
 * ADR 0020). The trust boundary that decides WHETHER a secret may be accessed and binds
 * every access to a least-privilege, short-lived, single-use, human-audited grant:
 * contract-first, vendor-neutral, deny-by-default, fail-closed, tenant-isolated,
 * explainable, replay-protected. It NEVER handles a plaintext secret value — the value
 * is opaque (`SecretHandle`), materialized only once, only inside an admitted sandbox,
 * only at the point of use, via an injected materializer port (dependency inversion).
 * It COMPOSES the frozen `adapters` SecretBroker and governance/agent-runtime contracts
 * (ADR 0016) and binds no real KMS/Vault/HSM/broker.
 */
export * from "./types.js";
export * from "./handle.js";
export * from "./lease.js";
export * from "./grant.js";
export * from "./agent-limits.js";
export * from "./approval.js";
export * from "./exfil.js";
export * from "./audit.js";
export * from "./adapters.js";
export * from "./sandbox-delivery.js";
export * from "./backup-safety.js";
export * from "./access.js";
export * from "./reference.js";
export * from "./health.js";
