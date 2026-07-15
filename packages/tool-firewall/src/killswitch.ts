/**
 * Tool / connector kill-switch (P0.8 Phase D2). A killed or revoked tool or connector
 * is refused fail-closed. Composes with the emergency-lockdown / revocation model from
 * `hardening` (a killed tool cannot invoke). AI cannot lift a kill-switch.
 */
import { decide } from "./types.js";
import type { ToolDecision } from "./types.js";

export type KillSwitchStatus = "ACTIVE" | "TOOL_KILLED" | "CONNECTOR_KILLED";

export interface KillSwitch {
  isToolKilled(toolId: string): boolean;
  isConnectorKilled(connectorId: string): boolean;
}

export interface EvaluateKillSwitchInput {
  killSwitch: KillSwitch;
  toolId: string;
  connectorId: string;
  now: string;
}

export function evaluateKillSwitch(input: EvaluateKillSwitchInput): ToolDecision<KillSwitchStatus> {
  const base = { evaluatedAt: input.now };
  if (input.killSwitch.isConnectorKilled(input.connectorId)) {
    return decide<KillSwitchStatus>({ ...base, decision: "CONNECTOR_KILLED", reasonCode: "connector_killed", humanReadableReason: "The connector is kill-switched; no tool on it may invoke.", nextRequiredAction: "Clear the connector kill-switch through an audited human action." });
  }
  if (input.killSwitch.isToolKilled(input.toolId)) {
    return decide<KillSwitchStatus>({ ...base, decision: "TOOL_KILLED", reasonCode: "tool_killed", humanReadableReason: "The tool is kill-switched.", nextRequiredAction: "Clear the tool kill-switch through an audited human action." });
  }
  return decide<KillSwitchStatus>({ ...base, decision: "ACTIVE", reasonCode: "not_killed", humanReadableReason: "Neither the tool nor its connector is kill-switched.", nextRequiredAction: "Continue firewall evaluation." });
}

/** Test-only in-memory kill-switch. A human (never an agent) operates it. */
export class InMemoryToolKillSwitch implements KillSwitch {
  readonly testOnly = true as const;
  readonly #tools = new Set<string>();
  readonly #connectors = new Set<string>();
  killTool(toolId: string): void {
    this.#tools.add(toolId);
  }
  killConnector(connectorId: string): void {
    this.#connectors.add(connectorId);
  }
  isToolKilled(toolId: string): boolean {
    return this.#tools.has(toolId);
  }
  isConnectorKilled(connectorId: string): boolean {
    return this.#connectors.has(connectorId);
  }
}

/** An agent can never lift a kill-switch. */
export function assertKillSwitchNotLiftedByAi(actorKind: string, lifting: boolean): void {
  if (lifting && (actorKind === "AGENT" || actorKind === "DIGITAL_EMPLOYEE")) {
    throw new Error("An AI/agent cannot lift a tool/connector kill-switch.");
  }
}
