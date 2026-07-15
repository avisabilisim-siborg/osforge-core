/**
 * OSForge Tool & MCP Security Boundary (P0.8 Phase D2 / Roadmap Sprint 11, ADR 0015
 * step 7). The trust boundary for external tools, MCP connectors and tool output:
 * contract-first, deny-by-default, fail-closed, tenant-isolated, explainable,
 * replay-protected. A tool is invoked ONLY through a registered, identity-verified,
 * non-killed descriptor, within its permission scope, with schema-validated
 * parameters, human approval when required, a valid single-use tool-bound
 * ExecutionPermit, sandbox admission and a writable audit sink — else fail-closed.
 * It COMPOSES the frozen agent-runtime / governance contracts (ADR 0016) and binds no
 * real connector, MCP server, schema engine, LLM or tool execution.
 */
export * from "./types.js";
export * from "./descriptor.js";
export * from "./permission.js";
export * from "./schema.js";
export * from "./permit-binding.js";
export * from "./killswitch.js";
export * from "./output.js";
export * from "./invocation.js";
export * from "./audit.js";
export * from "./adapters.js";
export * from "./reference.js";
export * from "./health.js";
