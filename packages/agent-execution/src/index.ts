/**
 * OSForge Execution Engine Contracts (P0.8 Phase D1). Contract-first,
 * dependency-inverted, fail-closed contracts for the execution engine — the layer
 * that runs a governed action's effect ONLY after consuming a valid, single-use
 * ExecutionPermit (via the agent-runtime seam), inside an admitted sandbox, with an
 * immutable audit written first. Phase D1 builds NO production tool execution,
 * connects NO external service, integrates NO LLM, and adds NO runtime dependency.
 * Reference implementations are `testOnly` and refused in production.
 */
export * from "./types.js";
export * from "./executor.js";
export * from "./sandbox.js";
export * from "./audit.js";
export * from "./engine.js";
export * from "./reference.js";
export * from "./health.js";
