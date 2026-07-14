import type {
  EventId,
  CorrelationId,
  TenantId,
  WorkspaceId,
  ProducerId,
  ConsumerId,
  SchemaVersion,
  StreamVersion,
  ValidatedSchema,
  EventSchema
} from "../packages/event-foundation/src/index.js";
import { tenantId, eventId } from "../packages/event-foundation/src/index.js";

// Branded ids are not interchangeable (§27).
const e: EventId = eventId("e1");
// @ts-expect-error an EventId is not a CorrelationId.
const c: CorrelationId = e;
void c;

const t: TenantId = tenantId("t1");
// @ts-expect-error a TenantId is not a WorkspaceId.
const w: WorkspaceId = t;
void w;

declare const pid: ProducerId;
// @ts-expect-error a ProducerId is not a ConsumerId.
const cid: ConsumerId = pid;
void cid;

declare const sv: SchemaVersion;
// @ts-expect-error a SchemaVersion is not a StreamVersion.
const stv: StreamVersion = sv;
void stv;

// An unvalidated schema cannot masquerade as a validated one (branded, §27).
declare const rawSchema: EventSchema;
// @ts-expect-error a plain EventSchema is not a ValidatedSchema.
const vs: ValidatedSchema = rawSchema;
void vs;

// A raw string cannot be used where a branded id is required.
// @ts-expect-error a plain string is not an EventId.
const badEvent: EventId = "e1";
void badEvent;
