import type {
  AuthorizationDecision,
  FinalExecutionDecision,
  PolicyDecision
} from "../packages/policy/src/index.js";
import { createExecutionPermit } from "../packages/policy/src/index.js";

declare const authorizationDecision: AuthorizationDecision;
declare const policyDecision: PolicyDecision;
declare const finalExecutionDecision: FinalExecutionDecision;

createExecutionPermit(finalExecutionDecision);

// @ts-expect-error AuthorizationDecision is not a final execution grant.
createExecutionPermit(authorizationDecision);

// @ts-expect-error PolicyDecision is not a final execution grant.
createExecutionPermit(policyDecision);

// @ts-expect-error A plain object cannot forge a FinalExecutionDecision.
createExecutionPermit({
  status: "GRANTED",
  checks: [],
  reason: "forged"
});
