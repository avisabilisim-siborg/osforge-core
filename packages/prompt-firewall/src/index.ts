/**
 * OSForge Prompt Firewall (P1 Sprint 13 Phase B). Technology-neutral, vendor-independent,
 * fail-closed, deny-by-default, tenant-isolated. Separates instructions (trusted only)
 * from data (everything else), screens untrusted content for injection, and emits an
 * explainable verdict. Core rule: UNTRUSTED CONTENT IS DATA, NEVER AUTHORITY. It NEVER
 * produces an authorization (the strongest ALLOW is ALLOW_AS_DATA). It COMPOSES the
 * frozen `content-trust` and `detection` contracts (ADR 0016/0021) and binds no real
 * classifier, model or LLM.
 *
 * See docs/architecture/PROMPT_FIREWALL_SECURITY_MODEL.md.
 */
export * from "./types.js";
export * from "./normalize.js";
export * from "./injection.js";
export * from "./frame.js";
export * from "./sanitize.js";
export * from "./firewall.js";
export * from "./health.js";
