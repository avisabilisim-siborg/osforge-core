import type { ExecutionPermit, FinalExecutionDecision } from "../packages/policy/src/index.js";
import { createExecutionPermit } from "../packages/policy/src/index.js";
import type {
  MFAChallengeResult,
  StepUpAuthenticationResult,
  VerifiedIdentityContext
} from "../packages/identity/src/index.js";

declare const finalExecutionDecision: FinalExecutionDecision;
declare const verifiedIdentityContext: VerifiedIdentityContext;

createExecutionPermit(finalExecutionDecision);

// @ts-expect-error A verified identity context is not a final execution grant.
createExecutionPermit(verifiedIdentityContext);

// @ts-expect-error A verified identity context cannot be assigned as an execution permit.
const forgedPermit: ExecutionPermit = verifiedIdentityContext;

// @ts-expect-error A plain object cannot forge an MFA challenge result.
const forgedMFA: MFAChallengeResult = {
  challengeId: "challenge_1",
  subjectId: "subject_1",
  sessionId: "session_1",
  factorId: "factor_1",
  actionClass: "admin",
  status: "success",
  assuranceLevel: "aal3",
  phishingResistant: true,
  completedAt: "2026-07-08T12:00:00.000Z",
  expiresAt: "2026-07-08T12:10:00.000Z"
};

// @ts-expect-error A plain object cannot forge a step-up result.
const forgedStepUp: StepUpAuthenticationResult = {
  subjectId: "subject_1",
  sessionId: "session_1",
  actionClass: "permission_change",
  status: "success",
  assuranceLevel: "aal3",
  completedAt: "2026-07-08T12:00:00.000Z",
  expiresAt: "2026-07-08T12:10:00.000Z"
};
