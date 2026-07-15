/**
 * Just-in-time, single-use, in-sandbox secret delivery (P0.8 Sprint 12). The boundary
 * returns a DELIVERY TICKET, never a value. Materialization happens only here, only
 * inside an admitted sandbox, only once per ticket, and the value exists only inside the
 * `consumer` callback wrapped as an opaque `SecretHandle`. After the callback returns,
 * the handle's closure is the only reference and it is never serialized (redacted).
 */
import { createSecretHandle } from "./handle.js";
import { decide } from "./types.js";
import type { SecretMaterializerPort, MaterializeRequest } from "./adapters.js";
import type { LeaseId, SecretDecision, SecretHandle, SecretRef } from "./types.js";

export interface DeliveryTicket {
  readonly ticketId: string;
  readonly leaseId: LeaseId;
  readonly secretRef: SecretRef;
  readonly rotationVersion: number;
  /** Whether the sandbox that will consume this ticket is admitted (isolated, no egress). */
  readonly sandboxAdmitted: boolean;
  readonly expiresAt: string;
}

export type DeliveryStatus = "DELIVERED" | "TICKET_EXPIRED" | "SANDBOX_NOT_ADMITTED" | "TICKET_CONSUMED" | "DELIVERY_DENIED";

export interface DeliveryOutcome<T> {
  readonly decision: SecretDecision<DeliveryStatus>;
  readonly result?: T;
}

/**
 * Materializes a secret exactly once, inside the sandbox, into an opaque handle passed
 * to `consumer`. Enforces ticket expiry, sandbox admission and single-use. The plaintext
 * is never returned to the caller — only whatever `consumer` chooses to return (which
 * must itself be secret-free; callers pass that through the exfil scan separately).
 */
export async function deliverIntoSandbox<T>(args: {
  ticket: DeliveryTicket;
  port: SecretMaterializerPort;
  consumedTickets: Set<string>;
  now: string;
  consumer: (handle: SecretHandle) => T;
}): Promise<DeliveryOutcome<T>> {
  const base = { evaluatedAt: args.now };
  const { ticket } = args;
  if (Date.parse(ticket.expiresAt) <= Date.parse(args.now)) {
    return { decision: decide<DeliveryStatus>({ ...base, decision: "TICKET_EXPIRED", reasonCode: "ticket_expired", humanReadableReason: "The delivery ticket expired before materialization.", nextRequiredAction: "Re-run the access gate for a fresh ticket." }) };
  }
  if (!ticket.sandboxAdmitted) {
    return { decision: decide<DeliveryStatus>({ ...base, decision: "SANDBOX_NOT_ADMITTED", reasonCode: "sandbox_not_admitted", humanReadableReason: "The consuming sandbox is not admitted (isolation/egress not proven).", nextRequiredAction: "Admit an isolated, no-egress sandbox." }) };
  }
  if (args.consumedTickets.has(ticket.ticketId)) {
    return { decision: decide<DeliveryStatus>({ ...base, decision: "TICKET_CONSUMED", reasonCode: "ticket_consumed", humanReadableReason: "The single-use delivery ticket was already consumed.", nextRequiredAction: "Re-run the access gate for a fresh ticket." }) };
  }
  // Reserve the ticket BEFORE materializing so a throwing consumer cannot enable replay.
  args.consumedTickets.add(ticket.ticketId);
  const request: MaterializeRequest = { secretRef: ticket.secretRef, leaseId: ticket.leaseId, rotationVersion: ticket.rotationVersion };
  const result = await args.port.materialize(request, (value) => {
    const handle = createSecretHandle(ticket.leaseId, value);
    return args.consumer(handle);
  });
  if (result === null) {
    return { decision: decide<DeliveryStatus>({ ...base, decision: "DELIVERY_DENIED", reasonCode: "provider_declined", humanReadableReason: "The secret provider declined to materialize the secret.", nextRequiredAction: "Verify the secret exists and the provider is healthy." }) };
  }
  return { decision: decide<DeliveryStatus>({ ...base, decision: "DELIVERED", reasonCode: "delivered", humanReadableReason: "The secret was materialized once inside the sandbox and consumed opaquely.", nextRequiredAction: "None; the handle is out of scope." }), result };
}
