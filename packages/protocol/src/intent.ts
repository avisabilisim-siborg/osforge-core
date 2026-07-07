import type { Actor, OSForgeContext } from "./core.js";

export type IntentConfidence = "low" | "medium" | "high";

export type IntentRiskLevel = "low" | "medium" | "high" | "critical";

export interface IntentRequest {
  id: string;
  context: OSForgeContext;
  actor: Actor;
  input: string;
  channel: "api" | "chat" | "workflow" | "system";
  receivedAt: string;
}

export interface ParsedIntent {
  id: string;
  requestId: string;
  summary: string;
  goal: string;
  confidence: IntentConfidence;
  riskLevel: IntentRiskLevel;
  requiredCapabilities: string[];
  entities: Record<string, unknown>;
}
