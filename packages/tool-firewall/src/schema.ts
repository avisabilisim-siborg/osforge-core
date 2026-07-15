/**
 * Tool parameter schema validation (P0.8 Phase D2). Tool parameters cannot execute
 * without passing the tool's declared schema. Defends parameter injection: the
 * declared schema digest must match the registered digest; prototype-pollution keys,
 * oversized/deeply-nested payloads, missing required fields and type mismatches are
 * refused. The concrete schema engine is an adapter — the reference validates a small,
 * declarative field spec (no code execution).
 */
import { hasUnsafeKeys, nodeCount } from "./internal/crypto.js";
import { decide } from "./types.js";
import type { ToolDecision } from "./types.js";

export type ToolFieldType = "string" | "number" | "boolean" | "object" | "array";
export interface ToolParamField {
  name: string;
  type: ToolFieldType;
  required: boolean;
}
export interface ToolParamSpec {
  fields: readonly ToolParamField[];
  maxNodes: number;
}

export type ToolSchemaStatus =
  | "VALID"
  | "SCHEMA_DIGEST_MISMATCH"
  | "PARAM_UNSAFE_KEYS"
  | "PARAM_TOO_LARGE"
  | "PARAM_REQUIRED_MISSING"
  | "PARAM_TYPE_MISMATCH";

export interface ValidateParamsInput {
  spec: ToolParamSpec;
  registeredSchemaDigest: string;
  presentedSchemaDigest: string;
  params: unknown;
  now: string;
}

function typeOf(value: unknown): ToolFieldType | "null" | "undefined" {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === "object") return t;
  return "object";
}

export function validateToolParameters(input: ValidateParamsInput): ToolDecision<ToolSchemaStatus> {
  const base = { evaluatedAt: input.now };
  if (input.registeredSchemaDigest !== input.presentedSchemaDigest) {
    return decide<ToolSchemaStatus>({ ...base, decision: "SCHEMA_DIGEST_MISMATCH", reasonCode: "schema_digest_mismatch", humanReadableReason: "The presented parameter schema does not match the registered schema.", nextRequiredAction: "Use the authentic tool schema." });
  }
  if (hasUnsafeKeys(input.params)) {
    return decide<ToolSchemaStatus>({ ...base, decision: "PARAM_UNSAFE_KEYS", reasonCode: "param_unsafe_keys", humanReadableReason: "Tool parameters contain unsafe keys (possible prototype pollution / parameter injection).", nextRequiredAction: "Remove unsafe keys from the parameters." });
  }
  if (nodeCount(input.params, input.spec.maxNodes) > input.spec.maxNodes) {
    return decide<ToolSchemaStatus>({ ...base, decision: "PARAM_TOO_LARGE", reasonCode: "param_too_large", humanReadableReason: "Tool parameters exceed the permitted size/depth.", nextRequiredAction: "Reduce the parameter payload." });
  }
  const record: Record<string, unknown> = (typeof input.params === "object" && input.params !== null && !Array.isArray(input.params)) ? (input.params as Record<string, unknown>) : {};
  for (const field of input.spec.fields) {
    const present = Object.prototype.hasOwnProperty.call(record, field.name);
    if (field.required && !present) {
      return decide<ToolSchemaStatus>({ ...base, decision: "PARAM_REQUIRED_MISSING", reasonCode: "param_required_missing", humanReadableReason: `Required parameter '${field.name}' is missing.`, nextRequiredAction: "Provide the required parameter." });
    }
    if (present) {
      const actual = typeOf(record[field.name]);
      if (actual !== field.type) {
        return decide<ToolSchemaStatus>({ ...base, decision: "PARAM_TYPE_MISMATCH", reasonCode: "param_type_mismatch", humanReadableReason: `Parameter '${field.name}' should be ${field.type} but is ${actual}.`, nextRequiredAction: "Correct the parameter type." });
      }
    }
  }
  return decide<ToolSchemaStatus>({ ...base, decision: "VALID", reasonCode: "params_valid", humanReadableReason: "Tool parameters match the declared schema and are safe.", nextRequiredAction: "Proceed to approval/permit checks." });
}
