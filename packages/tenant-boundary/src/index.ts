/**
 * OSForge Multi-Tenant Security Boundary (PR-E). Technology-neutral, vendor-independent,
 * fail-closed, deny-by-default, explainable. Defines the tenant / organization /
 * workspace / context / isolation / trust / scope boundary rules as CONTRACTS ONLY:
 * no runtime wiring, no database, no migration, no production tenant logic. It NEVER
 * produces an authorization (no permit/capability/approval/ALLOW type) — governance
 * remains the sole authority (ADR 0017). It COMPOSES, and does not redefine, the
 * canonical context-isolation contract in `packages/protocol` (ADR 0016).
 *
 * See docs/multi-tenant/MULTI_TENANT_SECURITY_MODEL.md.
 */
export * from "./types.js";
export * from "./isolation.js";
export * from "./access.js";
export * from "./identity.js";
export * from "./audit.js";
export * from "./saas.js";
export * from "./health.js";
