/**
 * Execution graph (requirement §18).
 *
 * All execution is representable as a DAG: nodes are steps, edges are
 * `dependsOn` prerequisites. Validation topologically orders the graph and
 * rejects duplicates, missing dependencies and cycles (fail closed).
 */
export interface ExecutionNode {
  id: string;
  action: string;
  dependsOn: readonly string[];
}

export interface ExecutionGraph {
  nodes: readonly ExecutionNode[];
}

export type ExecutionGraphValidation =
  | { ok: true; order: readonly string[] }
  | { ok: false; reason: "duplicate_node" | "missing_dependency" | "cycle"; detail: string; nodes: readonly string[] };

export function validateExecutionGraph(graph: ExecutionGraph): ExecutionGraphValidation {
  const nodes = graph?.nodes ?? [];
  const byId = new Map<string, ExecutionNode>();

  for (const node of nodes) {
    if (byId.has(node.id)) {
      return { ok: false, reason: "duplicate_node", detail: `Duplicate node id '${node.id}'.`, nodes: [node.id] };
    }
    byId.set(node.id, node);
  }

  const missing: string[] = [];
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!byId.has(dep)) {
        missing.push(dep);
      }
    }
  }
  if (missing.length > 0) {
    return { ok: false, reason: "missing_dependency", detail: `Unknown dependencies: ${[...new Set(missing)].join(", ")}.`, nodes: [...new Set(missing)] };
  }

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    inDegree.set(node.id, node.dependsOn.length);
  }
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      const list = dependents.get(dep) ?? [];
      list.push(node.id);
      dependents.set(dep, list);
    }
  }

  const ready = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id).sort();
  const order: string[] = [];

  while (ready.length > 0) {
    const next = ready.shift();
    if (next === undefined) {
      break;
    }
    order.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const degree = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, degree);
      if (degree === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }

  if (order.length !== nodes.length) {
    const cycle = nodes.map((n) => n.id).filter((id) => !order.includes(id));
    return { ok: false, reason: "cycle", detail: `Execution cycle detected among: ${cycle.join(", ")}.`, nodes: cycle };
  }

  return { ok: true, order };
}

export function dependentsOf(graph: ExecutionGraph, nodeId: string): readonly string[] {
  return graph.nodes.filter((n) => n.dependsOn.includes(nodeId)).map((n) => n.id);
}
