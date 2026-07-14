/**
 * Event schema foundation (P0.6.5, §7). Schema-less and unknown-schema events are
 * rejected; breaking changes require a new major version; a schema version is
 * immutable and a revoked schema can never mint new events. The registry verifies
 * provenance/integrity so a spoofed registry entry is rejected.
 */
import { digestOf, isNonEmptyString } from "./internal/crypto.js";
import { decide } from "./types.js";
import type { EventDecision, SchemaId, SchemaVersion, TenantId } from "./types.js";

export type EventSchemaCompatibility = "NONE" | "BACKWARD" | "FORWARD" | "FULL" | "BREAKING" | "REVOKED";

export interface EventSchema {
  readonly schemaId: SchemaId;
  readonly schemaName: string;
  readonly schemaVersion: SchemaVersion;
  readonly major: number;
  readonly minor: number;
  readonly compatibility: EventSchemaCompatibility;
  readonly status: "active" | "deprecated" | "revoked";
  readonly definitionDigest: string;
  readonly provenanceRef: string;
  readonly registeredAt: string;
  readonly tenantScope?: TenantId;
}

export interface EventSchemaRegistration {
  schema: EventSchema;
  /** The definition body, digested at registration — never stored inline here. */
  definition: unknown;
  registrarPrincipalRef: string;
}

export type SchemaValidationStatus =
  | "VALID"
  | "SCHEMA_MISSING"
  | "SCHEMA_UNKNOWN"
  | "SCHEMA_REVOKED"
  | "SCHEMA_DEPRECATED_BLOCKED"
  | "VERSION_UNSUPPORTED"
  | "BREAKING_WITHOUT_MAJOR"
  | "DEFINITION_DIGEST_MISMATCH"
  | "REGISTRY_SPOOFED";

export interface EventSchemaRegistry {
  readonly testOnly: boolean;
  register(reg: EventSchemaRegistration): EventDecision<"REGISTERED" | "REJECTED">;
  get(name: string, version: SchemaVersion): EventSchema | undefined;
  isRevoked(name: string, version: SchemaVersion): boolean;
}

export interface ValidateSchemaInput {
  registry: EventSchemaRegistry;
  schemaName: string;
  schemaVersion: SchemaVersion;
  /** The producer-declared definition digest, checked against the registry. */
  declaredDefinitionDigest?: string;
  /** Major versions this consumer can process (empty = producer-side check only). */
  supportedMajors?: readonly number[];
  now: string;
}

/** A validated schema handle — branded so unvalidated schemas cannot masquerade. */
declare const validatedSchemaBrand: unique symbol;
export type ValidatedSchema = EventSchema & { readonly [validatedSchemaBrand]: "validated" };

export interface SchemaValidationResult {
  decision: EventDecision<SchemaValidationStatus>;
  schema?: ValidatedSchema;
}

export function validateEventSchema(input: ValidateSchemaInput): SchemaValidationResult {
  const base = { evaluatedAt: input.now };
  if (!isNonEmptyString(input.schemaName) || !isNonEmptyString(input.schemaVersion)) {
    return { decision: decide<SchemaValidationStatus>({ ...base, decision: "SCHEMA_MISSING", reasonCode: "schema_missing", humanReadableReason: "An event must reference a named, versioned schema.", nextRequiredAction: "Attach a registered schema name and version." }) };
  }
  if (input.registry.isRevoked(input.schemaName, input.schemaVersion)) {
    return { decision: decide<SchemaValidationStatus>({ ...base, decision: "SCHEMA_REVOKED", reasonCode: "schema_revoked", humanReadableReason: "This schema version has been revoked and cannot mint new events.", nextRequiredAction: "Publish under a supported, non-revoked schema version." }) };
  }
  const schema = input.registry.get(input.schemaName, input.schemaVersion);
  if (!schema) {
    return { decision: decide<SchemaValidationStatus>({ ...base, decision: "SCHEMA_UNKNOWN", reasonCode: "schema_unknown", humanReadableReason: "No such schema is registered.", nextRequiredAction: "Register the schema before publishing." }) };
  }
  if (schema.status === "revoked" || schema.compatibility === "REVOKED") {
    return { decision: decide<SchemaValidationStatus>({ ...base, decision: "SCHEMA_REVOKED", reasonCode: "schema_revoked", humanReadableReason: "This schema version has been revoked.", nextRequiredAction: "Publish under a supported schema version." }) };
  }
  if (input.declaredDefinitionDigest !== undefined && input.declaredDefinitionDigest !== schema.definitionDigest) {
    return { decision: decide<SchemaValidationStatus>({ ...base, decision: "DEFINITION_DIGEST_MISMATCH", reasonCode: "definition_digest_mismatch", humanReadableReason: "The declared schema definition does not match the registered digest (possible spoofing).", nextRequiredAction: "Re-fetch the authentic schema from the registry." }) };
  }
  if (schema.compatibility === "BREAKING" && schema.minor !== 0) {
    return { decision: decide<SchemaValidationStatus>({ ...base, decision: "BREAKING_WITHOUT_MAJOR", reasonCode: "breaking_without_major", humanReadableReason: "A breaking change must bump the major version.", nextRequiredAction: "Publish the breaking schema as a new major version." }) };
  }
  if (input.supportedMajors && input.supportedMajors.length > 0 && !input.supportedMajors.includes(schema.major)) {
    return { decision: decide<SchemaValidationStatus>({ ...base, decision: "VERSION_UNSUPPORTED", reasonCode: "version_unsupported", humanReadableReason: "The consumer does not support this schema major version.", nextRequiredAction: "Upgrade the consumer or downshift to a supported major." }) };
  }
  return {
    decision: decide<SchemaValidationStatus>({ ...base, decision: "VALID", reasonCode: "schema_valid", humanReadableReason: "Schema is registered, current and compatible.", nextRequiredAction: "Proceed to payload integrity validation." }),
    schema: schema as ValidatedSchema
  };
}

// ---- Migration & deprecation contracts ----
export interface EventSchemaMigration {
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  deterministic: boolean;
  migrationRef: string;
  reversible: boolean;
}

export function isMigrationAcceptable(m: EventSchemaMigration): boolean {
  // Migrations must be deterministic and verifiable (§7).
  return m.deterministic && isNonEmptyString(m.migrationRef);
}

export interface EventSchemaDeprecation {
  schemaName: string;
  schemaVersion: SchemaVersion;
  deprecatedAt: string;
  sunsetAt?: string;
  replacementVersion?: SchemaVersion;
}

export interface EventSchemaRevocation {
  schemaName: string;
  schemaVersion: SchemaVersion;
  revokedAt: string;
  reasonCode: string;
}

/** Digest a schema definition body for registration/verification. */
export function schemaDefinitionDigest(definition: unknown): string {
  return digestOf(definition);
}
