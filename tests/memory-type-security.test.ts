import type { MemoryHealthStatus, MemoryRecord, MemoryTier } from "../packages/memory/src/index.js";

// Memory tier is a closed union.
// @ts-expect-error "banana" is not a valid memory tier.
const badTier: MemoryTier = "banana";
void badTier;

// Health status is a closed union.
// @ts-expect-error "OK" is not a valid memory health status.
const badHealth: MemoryHealthStatus = "OK";
void badHealth;

// Records are immutable — their fields are readonly.
declare const record: MemoryRecord;
// @ts-expect-error value is readonly on an immutable memory record.
record.value = 1;
// @ts-expect-error scope is readonly on an immutable memory record.
record.scope = { tenantId: "t", workspaceId: "w" };
