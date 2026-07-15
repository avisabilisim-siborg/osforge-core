/**
 * OSForge Agent Runtime (P0.8 Phase A). Technology-neutral, contract-first,
 * fail-closed, tenant-isolated, explainable. This package is the agent layer that
 * turns "an actor wants to do X" into a governed, permitted, sandboxed, audited
 * execution — but Phase A defines CONTRACTS, INTERFACES and REFERENCE
 * implementations only. It builds no execution engine, connects no external service,
 * and implements no voice runtime. The governance/identity/sandbox/executor/reasoner
 * seams are adapter interfaces, wired to the canonical foundations in a later phase
 * (ADR 0016, ADR 0017). The reasoner is treated as an UNTRUSTED planner: it proposes,
 * governance disposes, and no action executes without a single-use execution permit.
 */
export * from "./types.js";
export * from "./agent.js";
export * from "./lifecycle.js";
export * from "./provenance.js";
export * from "./injection.js";
export * from "./reasoner.js";
export * from "./tools.js";
export * from "./action.js";
export * from "./loop.js";
export * from "./conversation.js";
export * from "./multi-agent.js";
export * from "./voice.js";
export * from "./workers.js";
export * from "./schedule.js";
export * from "./approval.js";
export * from "./audit.js";
export * from "./health.js";
export * from "./adapters.js";
export * from "./reference.js";
