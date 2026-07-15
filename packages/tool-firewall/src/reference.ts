/**
 * Reference in-memory components (P0.8 Phase D2). Every reference is `testOnly` and
 * refused in production. Real connectors / MCP servers / schema engines are bound only
 * through the §adapters.
 */
import type { ToolScope } from "./types.js";
import type { RegisteredTool } from "./descriptor.js";

export class InMemoryToolRegistry {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #byId = new Map<string, RegisteredTool>();
  register(tool: RegisteredTool): void {
    this.#byId.set(`${tool.scope.tenantId}::${tool.scope.workspaceId}::${tool.toolId}`, Object.freeze({ ...tool }));
  }
  resolve(toolId: string, scope: ToolScope): RegisteredTool | undefined {
    return this.#byId.get(`${scope.tenantId}::${scope.workspaceId}::${toolId}`);
  }
}

/** Test-only single-use tool permit consumer (mirrors the governance permit model). */
export class InMemoryToolPermitConsumer {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #spent = new Set<string>();
  consume(nonce: string): "CONSUMED" | "REPLAYED" {
    if (this.#spent.has(nonce)) {
      return "REPLAYED";
    }
    this.#spent.add(nonce);
    return "CONSUMED";
  }
  seen(): ReadonlySet<string> {
    return this.#spent;
  }
}
// Note: `assertNotTestReferenceInProduction` / `assertProductionAdapter` are exported
// from `./types.js` and reused here — not redefined.
