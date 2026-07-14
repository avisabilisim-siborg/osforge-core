import type { OSForgeContext } from "#protocol";
import { isNonEmptyString } from "./internal/util.js";
import type { PipelineRiskLevel, ResourceRef } from "./types.js";

/**
 * Intent boundary (Constitution §11 human-creativity, sprint brief §11).
 *
 * An intent represents a REQUEST only. It is not authority, not approval, not a
 * permit, and not execution. A prompt or voice input can become an intent, but
 * an intent can never be coerced directly into a tool execution: it must pass
 * through the full secure pipeline, which alone can mint a permit.
 */
export interface Intent {
  readonly kind: "intent";
  readonly intentId: string;
  readonly context: OSForgeContext;
  readonly requestedAction: string;
  readonly resource: ResourceRef;
  readonly rawInput: string;
  readonly channel: "api" | "chat" | "voice" | "workflow" | "system";
  readonly statedRiskLevel: PipelineRiskLevel;
  readonly receivedAt: string;
}

export function createIntent(input: Omit<Intent, "kind">): Intent | null {
  if (
    !isNonEmptyString(input.intentId) ||
    !isNonEmptyString(input.requestedAction) ||
    !isNonEmptyString(input.rawInput) ||
    !isNonEmptyString(input.receivedAt) ||
    typeof input.resource !== "object" ||
    input.resource === null
  ) {
    return null;
  }

  return Object.freeze({
    kind: "intent",
    intentId: input.intentId,
    context: input.context,
    requestedAction: input.requestedAction,
    resource: Object.freeze({ id: input.resource.id, type: input.resource.type }),
    rawInput: input.rawInput,
    channel: input.channel,
    statedRiskLevel: input.statedRiskLevel,
    receivedAt: input.receivedAt
  });
}

export function isIntent(value: unknown): value is Intent {
  return typeof value === "object" && value !== null && (value as Intent).kind === "intent";
}

/**
 * Compile-time and runtime guard that an intent is never treated as an
 * executable authority. Any code path that receives an intent where a permit
 * is expected must reject it here.
 */
export function assertIntentIsNotExecutable(value: unknown): void {
  if (isIntent(value)) {
    throw new Error("An intent is a request, not an execution authority. Route it through the secure pipeline.");
  }
}
