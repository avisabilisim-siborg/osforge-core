import type {
  ExecutionId,
  EffectDescriptor,
  ExecutionOutcome,
  ExecutionEngine
} from "../packages/agent-execution/src/index.js";
import { executionId, ReferenceExecutionEngine } from "../packages/agent-execution/src/index.js";

// Branded ExecutionId is not a plain string.
const e: ExecutionId = executionId("ex1");
void e;
// @ts-expect-error a plain string is not an ExecutionId.
const bad: ExecutionId = "ex1";
void bad;

// EffectDescriptor.kind is a closed union.
const good: EffectDescriptor = { kind: "TOOL_CALL", effectDigest: "d" };
void good;
// @ts-expect-error "SHELL" is not a known effect kind.
const badEffect: EffectDescriptor = { kind: "SHELL", effectDigest: "d" };
void badEffect;

// EffectDescriptor is readonly.
declare const eff: EffectDescriptor;
// @ts-expect-error effectDigest is readonly.
eff.effectDigest = "x";

// ExecutionOutcome is a string literal union carrier, not a boolean.
declare const outcome: ExecutionOutcome;
// @ts-expect-error an outcome is not a boolean.
const asBool: boolean = outcome;
void asBool;

// The reference engine satisfies the ExecutionEngine contract.
const engine: ExecutionEngine = new ReferenceExecutionEngine({
  permitConsumer: { consume: () => "CONSUMED" },
  sandbox: { metadata: { id: "s", testOnly: true, productionReady: false }, admit: async () => ({ admitted: true, reasonCode: "ok" }) },
  audit: { metadata: { id: "a", testOnly: true, productionReady: false }, writable: () => true, append: () => ({ auditId: "x", sequence: 1, previousHash: "", currentHash: "", tenantId: "t", workspaceId: "w", event: "execution_completed", ticketRef: "r", reasonCode: "ok", at: "now" }) },
  executor: { metadata: { id: "x", testOnly: true, productionReady: false }, run: async () => ({ ok: true, resultDigest: "d", reasonCode: "ok" }) }
});
void engine;
