import { canonicalJson, isNonEmptyString, sha256Hex } from "./internal/crypto.js";

/**
 * Configuration governance (requirement §4).
 *
 * Environment variables are not a trusted source on their own. Unknown settings
 * fail closed. Production config is not loaded without schema validation. Secrets
 * never enter a snapshot. Config is versioned, integrity-hashed, drift-detected,
 * and rollback-able to the last known-good; critical changes need approval.
 */
export interface ConfigurationSchemaField {
  key: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  secret?: boolean;
  critical?: boolean;
}

export interface ConfigurationSchema {
  version: string;
  fields: readonly ConfigurationSchemaField[];
}

export interface ConfigurationSource {
  kind: "file" | "env" | "remote" | "default";
  trusted: boolean;
}

export type ConfigDecision = "ACCEPTED" | "REJECTED";

export interface ConfigurationValidationResult {
  decision: ConfigDecision;
  reasonCode: string;
  message: string;
  unknownKeys: readonly string[];
  missingKeys: readonly string[];
}

export function validateConfiguration(
  schema: ConfigurationSchema,
  values: Record<string, unknown>,
  source: ConfigurationSource
): ConfigurationValidationResult {
  // An env source alone is never trusted for production configuration.
  if (source.kind === "env" && !source.trusted) {
    return { decision: "REJECTED", reasonCode: "untrusted_source", message: "Environment source is not trusted on its own.", unknownKeys: [], missingKeys: [] };
  }
  const known = new Map(schema.fields.map((f) => [f.key, f]));
  const unknownKeys = Object.keys(values).filter((k) => !known.has(k));
  if (unknownKeys.length > 0) {
    // Unknown settings fail closed.
    return { decision: "REJECTED", reasonCode: "unknown_setting", message: `Unknown settings: ${unknownKeys.join(", ")}.`, unknownKeys, missingKeys: [] };
  }
  const missingKeys = schema.fields.filter((f) => f.required && values[f.key] === undefined).map((f) => f.key);
  if (missingKeys.length > 0) {
    return { decision: "REJECTED", reasonCode: "missing_required", message: `Missing required: ${missingKeys.join(", ")}.`, unknownKeys: [], missingKeys };
  }
  for (const field of schema.fields) {
    const value = values[field.key];
    if (value !== undefined && typeof value !== field.type) {
      return { decision: "REJECTED", reasonCode: "type_mismatch", message: `Field '${field.key}' has the wrong type.`, unknownKeys: [], missingKeys: [] };
    }
  }
  return { decision: "ACCEPTED", reasonCode: "validated", message: "Configuration validated.", unknownKeys: [], missingKeys: [] };
}

export interface ConfigurationSnapshot {
  version: string;
  values: Record<string, unknown>;
  integrityHash: string;
  createdAt: string;
}

/** Build a snapshot with secret fields stripped (never persisted) + integrity hash. */
export function buildConfigurationSnapshot(schema: ConfigurationSchema, values: Record<string, unknown>, version: string, createdAt: string): ConfigurationSnapshot {
  const secretKeys = new Set(schema.fields.filter((f) => f.secret).map((f) => f.key));
  const safeValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!secretKeys.has(key)) {
      safeValues[key] = value;
    }
  }
  const integrityHash = sha256Hex(canonicalJson({ version, values: safeValues, createdAt }));
  return { version, values: safeValues, integrityHash, createdAt };
}

export function verifyConfigurationIntegrity(snapshot: ConfigurationSnapshot): boolean {
  const expected = sha256Hex(canonicalJson({ version: snapshot.version, values: snapshot.values, createdAt: snapshot.createdAt }));
  return expected === snapshot.integrityHash;
}

export interface ConfigurationChangeRequest {
  key: string;
  reason: string;
  actorId: string;
  critical: boolean;
}

export interface ConfigurationApproval {
  approvalId: string;
  approverId: string;
  approverIsHuman: boolean;
}

export function evaluateConfigurationChange(request: ConfigurationChangeRequest, approval?: ConfigurationApproval): { ok: boolean; reasonCode: string } {
  if (!isNonEmptyString(request.reason) || !isNonEmptyString(request.actorId)) {
    return { ok: false, reasonCode: "reason_and_actor_required" };
  }
  if (request.critical) {
    if (!approval || approval.approverIsHuman !== true || !isNonEmptyString(approval.approvalId)) {
      return { ok: false, reasonCode: "critical_change_requires_human_approval" };
    }
  }
  return { ok: true, reasonCode: "change_authorized" };
}

export interface ConfigurationRollbackPlan {
  toVersion: string;
  snapshotRef: string;
}

export interface ConfigDriftResult {
  drifted: boolean;
  changedKeys: readonly string[];
}

export function detectConfigurationDrift(expected: ConfigurationSnapshot, observed: ConfigurationSnapshot): ConfigDriftResult {
  const changedKeys: string[] = [];
  const keys = new Set([...Object.keys(expected.values), ...Object.keys(observed.values)]);
  for (const key of keys) {
    if (canonicalJson(expected.values[key]) !== canonicalJson(observed.values[key])) {
      changedKeys.push(key);
    }
  }
  return { drifted: changedKeys.length > 0, changedKeys };
}
