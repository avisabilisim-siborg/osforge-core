/**
 * OSForge Production Adapter Layer (P0.8 Phase C). Interface-first,
 * dependency-inverted, fail-closed production adapter contracts for the six core
 * dependencies — Identity, Memory, Audit, Capability Registry, Approval Store and
 * Policy Repository. Each production interface EXTENDS its frozen base interface
 * (from `#governance` / `#agent-runtime`), so it is backward compatible by
 * construction. This package connects NO external service, builds NO execution
 * engine, integrates NO LLM and adds NO runtime dependency. Reference
 * implementations are `testOnly` and are refused in production.
 */
export * from "./types.js";
export * from "./lifecycle.js";
export * from "./fail-closed.js";
export * from "./identity-adapter.js";
export * from "./memory-adapter.js";
export * from "./audit-adapter.js";
export * from "./capability-adapter.js";
export * from "./approval-adapter.js";
export * from "./policy-adapter.js";
export * from "./registry.js";
