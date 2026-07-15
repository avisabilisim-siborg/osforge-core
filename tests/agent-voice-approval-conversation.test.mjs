import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateVoiceTurn,
  voiceIsLowAssurance,
  evaluateApprovalRelay,
  evaluateTurnAppend
} from "../dist/agent-runtime/src/index.js";
import { ptt, approvalRelay, scope, NOW, PAST } from "./agent-helpers.mjs";

// ---- Voice (push-to-talk only) ----
test("a finalized push-to-talk turn becomes governed input", () => {
  assert.equal(evaluateVoiceTurn({ session: ptt(), finalized: true, requestedMode: "PUSH_TO_TALK", now: NOW }).decision, "ACCEPTED_AS_GOVERNED_INPUT");
});
test("full-duplex is not supported in Phase A", () => {
  assert.equal(evaluateVoiceTurn({ session: ptt(), finalized: true, requestedMode: "FULL_DUPLEX", now: NOW }).decision, "FULL_DUPLEX_NOT_SUPPORTED");
});
test("a non-finalized push-to-talk turn is not acted on (no partial acting)", () => {
  assert.equal(evaluateVoiceTurn({ session: ptt({ state: "CAPTURING" }), finalized: false, requestedMode: "PUSH_TO_TALK", now: NOW }).decision, "NOT_FINALIZED");
});
test("voice is a low-assurance channel", () => {
  assert.equal(voiceIsLowAssurance(), true);
});
test("the finalized voice result states it will be injection-screened and governed", () => {
  assert.match(evaluateVoiceTurn({ session: ptt(), finalized: true, requestedMode: "PUSH_TO_TALK", now: NOW }).humanReadableReason, /injection-screened and fully governed/);
});

// ---- Approval relay (out-of-band; web/mobile; voice reuses same channel) ----
test("an undecided approval is relayed out-of-band", () => {
  assert.equal(evaluateApprovalRelay(approvalRelay({ decided: false })).decision, "REQUEST_DELIVERED");
});
test("an AI/agent approver is denied", () => {
  assert.equal(evaluateApprovalRelay(approvalRelay({ approverKind: "AGENT" })).decision, "AI_APPROVER_DENIED");
  assert.equal(evaluateApprovalRelay(approvalRelay({ approverKind: "DIGITAL_EMPLOYEE" })).decision, "AI_APPROVER_DENIED");
});
test("a service approver is denied", () => {
  assert.equal(evaluateApprovalRelay(approvalRelay({ approverKind: "SERVICE" })).decision, "AI_APPROVER_DENIED");
});
test("the requester cannot self-approve", () => {
  assert.equal(evaluateApprovalRelay(approvalRelay({ approverPrincipalId: "req1", requesterPrincipalId: "req1" })).decision, "SELF_APPROVAL_DENIED");
});
test("a consumed approval is refused (replay)", () => {
  assert.equal(evaluateApprovalRelay(approvalRelay({ consumed: true })).decision, "ALREADY_CONSUMED");
});
test("an expired approval is refused", () => {
  assert.equal(evaluateApprovalRelay(approvalRelay({ expiresAt: PAST })).decision, "EXPIRED");
});
test("a context change after approval invalidates it", () => {
  assert.equal(evaluateApprovalRelay(approvalRelay({ boundContextHash: "a", currentContextHash: "b" })).decision, "CONTEXT_CHANGED");
});
test("a valid human approval is accepted and triggers a fresh governance decision (no cache)", () => {
  const d = evaluateApprovalRelay(approvalRelay());
  assert.equal(d.decision, "APPROVAL_ACCEPTED");
  assert.match(d.humanReadableReason, /fresh permit|re-decides/);
});
test("voice approval reuses the same channel set", () => {
  assert.equal(evaluateApprovalRelay(approvalRelay({ channels: ["VOICE"], decided: false })).decision, "REQUEST_DELIVERED");
});

// ---- Conversation / turns ----
function conv(over = {}) {
  return { conversationId: "c1", scope, agentId: "ag1", state: "OPEN", lastSequence: 3, ...over };
}
function turn(over = {}) {
  return { turnId: "tn1", conversationId: "c1", role: "USER", channel: "TEXT", contentDigest: "d", sequence: 4, createdAt: NOW, ...over };
}
test("an in-order turn appends", () => {
  assert.equal(evaluateTurnAppend({ conversation: conv(), turn: turn(), contextTenantId: "t1", now: NOW }).decision, "APPENDED");
});
test("a cross-tenant turn is denied", () => {
  assert.equal(evaluateTurnAppend({ conversation: conv(), turn: turn(), contextTenantId: "t2", now: NOW }).decision, "TENANT_MISMATCH");
});
test("a closed conversation rejects new turns", () => {
  assert.equal(evaluateTurnAppend({ conversation: conv({ state: "CLOSED" }), turn: turn(), contextTenantId: "t1", now: NOW }).decision, "CONVERSATION_CLOSED");
});
test("a turn sequence rollback is refused", () => {
  assert.equal(evaluateTurnAppend({ conversation: conv({ lastSequence: 10 }), turn: turn({ sequence: 4 }), contextTenantId: "t1", now: NOW }).decision, "SEQUENCE_ROLLBACK");
});
test("a voice push-to-talk turn is a valid turn channel", () => {
  assert.equal(evaluateTurnAppend({ conversation: conv(), turn: turn({ channel: "VOICE_PUSH_TO_TALK" }), contextTenantId: "t1", now: NOW }).decision, "APPENDED");
});
