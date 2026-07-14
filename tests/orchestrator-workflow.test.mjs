import test from "node:test";
import assert from "node:assert/strict";

import {
  Orchestrator,
  WorkflowEngine,
  validateExecutionGraph
} from "../dist/orchestrator/src/index.js";
import { makeContext, makeDeps, makeRequest } from "./pipeline-helpers.mjs";

// ---- Execution graph (DAG) ----

test("valid execution graph yields a topological order", () => {
  const result = validateExecutionGraph({
    nodes: [
      { id: "a", action: "a", dependsOn: [] },
      { id: "b", action: "b", dependsOn: ["a"] },
      { id: "c", action: "c", dependsOn: ["b"] }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual([...result.order], ["a", "b", "c"]);
});

test("duplicate node id is rejected", () => {
  const result = validateExecutionGraph({ nodes: [{ id: "a", action: "a", dependsOn: [] }, { id: "a", action: "a2", dependsOn: [] }] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "duplicate_node");
});

test("missing dependency is rejected", () => {
  const result = validateExecutionGraph({ nodes: [{ id: "a", action: "a", dependsOn: ["ghost"] }] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_dependency");
});

test("execution cycle is rejected", () => {
  const result = validateExecutionGraph({ nodes: [{ id: "a", action: "a", dependsOn: ["b"] }, { id: "b", action: "b", dependsOn: ["a"] }] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "cycle");
});

// ---- Workflow engine ----

test("workflow runs all nodes successfully", async () => {
  const engine = new WorkflowEngine({ run: (node) => ({ nodeId: node.id, action: node.action, status: "succeeded" }) });
  const result = await engine.execute({
    planId: "p", intentId: "i",
    graph: { nodes: [{ id: "a", action: "a", dependsOn: [] }, { id: "b", action: "b", dependsOn: ["a"] }] }
  }, { correlationId: "c" });
  assert.equal(result.status, "succeeded");
  assert.equal(result.steps.length, 2);
});

test("a failed node skips its dependents but independent nodes still run", async () => {
  const engine = new WorkflowEngine({ run: (node) => ({ nodeId: node.id, action: node.action, status: node.id === "b" ? "failed" : "succeeded" }) });
  const result = await engine.execute({
    planId: "p", intentId: "i",
    graph: {
      nodes: [
        { id: "a", action: "a", dependsOn: [] },
        { id: "b", action: "b", dependsOn: ["a"] },
        { id: "c", action: "c", dependsOn: ["b"] },
        { id: "d", action: "d", dependsOn: [] }
      ]
    }
  }, { correlationId: "c" });
  const byId = Object.fromEntries(result.steps.map((s) => [s.nodeId, s.status]));
  assert.equal(byId.a, "succeeded");
  assert.equal(byId.b, "failed");
  assert.equal(byId.c, "skipped");
  assert.equal(byId.d, "succeeded");
  assert.equal(result.status, "partial");
});

test("invalid graph yields an invalid workflow result", async () => {
  const engine = new WorkflowEngine({ run: (node) => ({ nodeId: node.id, action: node.action, status: "succeeded" }) });
  const result = await engine.execute({ planId: "p", intentId: "i", graph: { nodes: [{ id: "a", action: "a", dependsOn: ["ghost"] }] } }, { correlationId: "c" });
  assert.equal(result.status, "invalid");
});

// ---- Orchestrator ↔ pipeline (delegation) ----

test("orchestrator executes a node through the secure pipeline", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const request = await makeRequest(ctx);
  const planner = (intent) => ({
    planId: "plan_1", intentId: intent.intentId,
    graph: { nodes: [{ id: "n1", action: "invoice.read", dependsOn: [] }] },
    toRequest: () => request
  });
  const orchestrator = new Orchestrator(deps.pipeline, planner);
  const result = await orchestrator.handle({ intentId: "intent_1", goal: "read invoice", correlationId: "corr_1" });
  assert.equal(result.workflow.status, "succeeded");
  assert.equal(result.nodeOutcomes[0].outcome.status, "EXECUTED");
});

test("orchestrator surfaces a pipeline denial as a failed workflow (no security decision of its own)", async () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const request = await makeRequest(ctx, { policyEffect: "DENY" });
  const planner = (intent) => ({
    planId: "plan_2", intentId: intent.intentId,
    graph: { nodes: [{ id: "n1", action: "invoice.read", dependsOn: [] }] },
    toRequest: () => request
  });
  const orchestrator = new Orchestrator(deps.pipeline, planner);
  const result = await orchestrator.handle({ intentId: "intent_2", goal: "read invoice", correlationId: "corr_2" });
  assert.equal(result.workflow.status, "failed");
  assert.equal(result.nodeOutcomes[0].outcome.status, "DENY");
});

test("orchestrator is a kernel module with orchestration metadata", () => {
  const ctx = makeContext();
  const deps = makeDeps();
  const orchestrator = new Orchestrator(deps.pipeline, () => ({ planId: "p", intentId: "i", graph: { nodes: [] }, toRequest: () => ({}) }));
  assert.equal(orchestrator.metadata.id, "orchestrator");
  assert.equal(typeof orchestrator.initialize, "function");
  assert.equal(typeof orchestrator.shutdown, "function");
});
