/**
 * OSForge Governance Spine (P0.7). Technology-neutral, contract-first, fail-closed,
 * tenant-isolated, explainable. Composes Policy, Authorization, Capability, Risk and
 * Human-Approval engines into one immutable governance decision pipeline that mints
 * a single-use, time-limited, context-bound execution permit. It binds to the
 * existing identity, memory, event, audit and runtime layers via adapters — it does
 * not re-implement them. No external policy engine, broker or database is bound.
 *
 * Public API surface (small, versionable). Internal helpers are not exported.
 */
export * from "./types.js";
export * from "./policy.js";
export * from "./authorization.js";
export * from "./capability.js";
export * from "./approval.js";
export * from "./risk.js";
export * from "./pipeline.js";
export * from "./audit.js";
export * from "./health.js";
export * from "./adapters.js";
export * from "./reference.js";
