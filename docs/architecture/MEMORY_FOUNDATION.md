# Memory Foundation

> Package: `packages/memory` · Sprint P0.5
> Position: above Runtime, below Agent. Technology-neutral — no LLM, vector DB, graph DB, KMS, or vendor.
> Constitution: §2 (fail closed), §4 (security), §7 (memory rules), §22 (explainability), §23 (audit), §24 (privacy).

The shared, persistent memory substrate for every 2035 capability (AI employees,
agents, voice/vision, workflow, planning, plugins, MCP, connectors, knowledge,
approval, audit). Memory defines **contracts**; all real systems (vector stores,
graph DBs, KMS) are **adapters** written later. Memory never depends on a vendor.

## Priority order
`Security → Reproducibility → Correctness → Auditability → Tenant Isolation → Recoverability → Performance → Features.`

## 1. Memory architecture

```mermaid
flowchart TB
  subgraph Agent["Agent / capabilities (above)"]
    A[AI employee · agent · workflow · plugin · MCP]
  end
  subgraph Memory["Memory Foundation (packages/memory)"]
    ACC[Access control\nzero-trust, deny-by-default]
    subgraph Tiers
      WM[Working / Short-term\nephemeral · TTL]
      LT[Long-term / Immutable\nversioned · append-only]
      EP[Episodic\ntimeline · replay]
      SEM[Semantic\nfacts · relationships]
      AUD[Audit memory\nhash-chained]
      APR[Approval memory]
      EX[Execution memory]
    end
    POL[Policy · TTL · retention · legal hold · delete approval]
    SNAP[Snapshot / restore / replay]
    OBS[Metrics · Trace · Health]
  end
  subgraph Contracts["Contracts only (no vendor)"]
    VEC[VectorStore] --- KG[KnowledgeGraph] --- ENC[Encryption] --- CMP[Compression] --- SR[Search/Index]
  end
  subgraph Runtime["Runtime (below)"]
    RT[Execution runtime]
  end
  A --> ACC --> Tiers
  Tiers --> POL
  Tiers --> AUD
  Tiers --> SNAP
  Memory -.abstractions.-> Contracts
  Memory --> RT
```

**Trust boundaries:** every operation crosses the access-control boundary
(known tenant, valid session, same-tenant scope, explicit permission). Memory is
immutable by default; the only mutable tier is working/short-term. Adapters
(vector/graph/KMS) sit behind interfaces and never enter the core.

## 2. Memory lifecycle

```mermaid
stateDiagram-v2
  [*] --> created
  created --> active
  active --> expired: TTL reached
  active --> archived: archive policy
  active --> deleted: human approval + audit
  expired --> archived
  expired --> deleted: human approval
  archived --> deleted: human approval
  archived --> restored: human approval
  deleted --> restored: human approval
  restored --> active
  deleted --> [*]
```

Deletion and restore are the human-approved transitions. A legal hold blocks
deletion entirely. History is retained through tombstoning (immutable).

## 3. Snapshot flow

```mermaid
flowchart LR
  R[Immutable records] --> D[content digest of record hashes]
  D --> S[MemorySnapshot\n+ integrity hash]
  S --> V{verify integrity?}
  V -- no --> X[(REJECTED)]
  V -- yes --> AP{human approval?}
  AP -- no --> X
  AP -- yes --> T{same tenant/workspace?}
  T -- no --> X2[(cross_tenant_restore)]
  T -- yes --> OK[restore authorized]
```

Snapshots (execution / memory / tenant) are integrity-hashed. Restore requires
integrity + human approval + same-tenant targeting.

## 4. Replay flow

```mermaid
flowchart LR
  E[Append event\npayload → digest] --> C[hash-chain link\nprev + seq + body]
  C --> TL[Episodic timeline]
  TL --> RP[replay: memory.replay permission]
  RP --> VF{verifyChain\nseq + prev + hash}
  VF -- broken --> F[(chain_broken / hash_mismatch)]
  VF -- ok --> OKR[verified replay]
```

Episodic memory stores payload digests (not raw payloads, which may hold
secrets). Replay is verified against the hash chain — never trusted.

## 5. Knowledge flow

```mermaid
flowchart LR
  F[Facts / relationships\nSemanticMemory contract] --> EMB[EmbeddingReference\nopaque, no vectors]
  EMB --> VS[VectorStore contract]
  F --> KG[KnowledgeGraph contract\nnodes + edges]
  VS -.adapter later.-> QD[(Qdrant/Milvus/pgvector — not in core)]
  KG -.adapter later.-> NEO[(Neo4j — not in core)]
```

Semantic knowledge is expressed as facts, relationships, and **opaque embedding
references** — no embeddings are computed and no vector/graph database is a
dependency. Real stores are adapters.

## Invariants
- **M1** Memory is immutable by default; writes append a new version, never mutate.
- **M2** No cross-tenant access, ever (structurally partitioned + authorized).
- **M3** Delete requires human approval; a legal hold blocks deletion.
- **M4** Every operation is audited on a tamper-evident hash chain; audit cannot be disabled.
- **M5** Working memory auto-expires on TTL; long-term persists and versions.
- **M6** Snapshot restore requires integrity + human approval + same tenant.
- **M7** Replay is verified against a hash chain; episodic stores digests, not raw payloads.
- **M8** No vendor/LLM/vector/graph/KMS dependency; all are adapters behind contracts.

## Failure modes (fail closed)
Unknown tenant → `unknown_tenant`; expired session → `session_expired`;
cross-tenant → `cross_tenant_denied` / `cross_tenant_restore`; missing permission
→ `permission_denied`; delete without approval → `delete_requires_human_approval`;
legal hold → `legal_hold_active`; test-only audit in production →
`audit_not_production_safe`; broken chain → `chain_broken` / `hash_mismatch`.

## Production adapters (not built here)
Durable long-term store; distributed audit chain; real KMS behind `MemoryEncryption`;
vector store behind `VectorStore`; graph DB behind `KnowledgeGraph`; compression
behind `MemoryCompression`; trace exporter behind `MemoryTrace`; embedding provider
behind `EmbeddingReference`.

## 2035 extension points
Multi-region tenant-scoped memory; federated episodic timelines; provider-
independent embeddings; memory learning/consolidation behind the immutable core;
knowledge-graph reasoning; encrypted-at-rest confidential memory.

## Known limits
- Reference stores are in-memory (`testOnly`) — durability is an adapter concern.
- Search/index reference is naive predicate filtering; real ranking is an adapter.
- Semantic/vector/knowledge/encryption/compression/trace are contracts only.

## Rollback plan
Additive: new `packages/memory` + `tests/memory-*` + type-test include + a
`test:security` list entry. No existing package, kernel, runtime, or public API is
changed. Rollback = delete `packages/memory`, the memory tests, and the two
config references.
