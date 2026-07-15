/**
 * OSForge Agent-Governance bridge (P0.8 Phase B). Wires the Agent Runtime to the
 * Governance Pipeline (ADR 0017): governance decides and mints a single-use permit;
 * the agent runtime enforces the seam and executes only on a clean ALLOW + permit.
 * The bridge re-implements neither package and adds no runtime dependency, no
 * execution engine, no external service, no LLM and no voice runtime.
 */
export * from "./mapping.js";
export * from "./bridge.js";
export * from "./governed-action.js";
