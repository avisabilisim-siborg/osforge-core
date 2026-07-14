/**
 * Model gateway contract (requirement §17). CONTRACT ONLY — no model is called.
 *
 * Claude, GPT, Gemini, DeepSeek and any future model sit behind this single
 * interface so no product logic hard-depends on one vendor (Constitution §5.7).
 * Real inference is gated on later sprints and always runs sandboxed.
 */
export type ModelProvider = "claude" | "gpt" | "gemini" | "deepseek" | "custom";

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ModelRequest {
  provider: ModelProvider;
  model: string;
  messages: readonly ModelMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  correlationId: string;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelResponse {
  ok: boolean;
  provider: ModelProvider;
  content?: string;
  usage?: ModelUsage;
  error?: string;
}

export interface ModelGateway {
  complete(request: ModelRequest): Promise<ModelResponse>;
}
