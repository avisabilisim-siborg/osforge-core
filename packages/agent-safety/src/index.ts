/**
 * OSForge AI Agent Safety Model (PR-D). Technology-neutral, vendor-independent,
 * fail-closed, deny-by-default, tenant-isolated. A SAFETY-CLASSIFICATION contract that
 * decides which controls a proposed agent action requires (analysis / recommendation /
 * human approval / multi approval / stop / deny). It NEVER produces an authorization
 * (no permit/capability/approval/ALLOW type), is NOT wired into any runtime/execution
 * path, binds no LLM/MCP/provider, and changes no production behavior. Governance remains
 * the sole authority (ADR 0017). It COMPOSES, and does not redefine, the agent-runtime /
 * governance contracts (ADR 0016).
 *
 * See docs/agent/AGENT_SAFETY_MODEL.md.
 */
export * from "./types.js";
export * from "./levels.js";
export * from "./permission.js";
export * from "./failure.js";
export * from "./invariants.js";
export * from "./health.js";
