import type {
  ExecutionAuthorization,
  Intent,
  SecurityDecision,
  SignedExecutionPermit
} from "../packages/pipeline/src/index.js";
import { isExecutionAuthorization } from "../packages/pipeline/src/index.js";

declare const intent: Intent;

// An intent is a request, never an execution authority. It cannot stand in for a permit.
// @ts-expect-error Intent is not assignable to SignedExecutionPermit.
const permitFromIntent: SignedExecutionPermit = intent;
void permitFromIntent;

// The execution authorization token is branded and minted only by the final gate.
// A structurally-shaped plain object cannot be assigned to it.
// @ts-expect-error A plain object cannot forge an ExecutionAuthorization.
const forgedAuthorization: ExecutionAuthorization = { permitId: "p", requestId: "r" };
isExecutionAuthorization(forgedAuthorization);

// The decision status is a closed, explicit union — not an open string.
// @ts-expect-error "MAYBE" is not a valid decision status.
const badStatus: SecurityDecision["status"] = "MAYBE";
void badStatus;
