import type { HealthStatus, ModuleKind, ModuleMetadata } from "../packages/kernel/src/index.js";

// Module kind is a closed union.
// @ts-expect-error "banana" is not a valid module kind.
const badKind: ModuleKind = "banana";
void badKind;

// Health status is a closed union.
// @ts-expect-error "OK" is not a valid health status.
const badStatus: HealthStatus = "OK";
void badStatus;

// Metadata requires the core fields.
// @ts-expect-error missing required metadata fields.
const badMetadata: ModuleMetadata = { id: "x" };
void badMetadata;
