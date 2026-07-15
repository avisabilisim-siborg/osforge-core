import type {
  IdentityTrustAdapter,
  CapabilityRegistryAdapter,
  ApprovalStoreAdapter,
  GovernanceAuditAdapter,
  PolicyRepositoryAdapter
} from "../packages/governance/src/index.js";
import type { MemoryGatewayAdapter } from "../packages/agent-runtime/src/index.js";
import type { ProductionAdapterMetadata, AdapterName } from "../packages/production-adapters/src/index.js";
import {
  InMemoryProductionIdentityAdapter,
  InMemoryProductionMemoryAdapter,
  InMemoryProductionAuditAdapter,
  InMemoryProductionCapabilityAdapter,
  InMemoryProductionApprovalAdapter,
  InMemoryProductionPolicyAdapter
} from "../packages/production-adapters/src/index.js";

// ---- Backward compatibility: each production adapter satisfies its frozen base ----
const identity: IdentityTrustAdapter = new InMemoryProductionIdentityAdapter();
void identity;
const memory: MemoryGatewayAdapter = new InMemoryProductionMemoryAdapter();
void memory;
const audit: GovernanceAuditAdapter = new InMemoryProductionAuditAdapter();
void audit;
const capability: CapabilityRegistryAdapter = new InMemoryProductionCapabilityAdapter();
void capability;
const approval: ApprovalStoreAdapter = new InMemoryProductionApprovalAdapter();
void approval;
const policy: PolicyRepositoryAdapter = new InMemoryProductionPolicyAdapter();
void policy;

// ---- Metadata is production-shaped and read-only ----
declare const meta: ProductionAdapterMetadata;
// @ts-expect-error ProductionAdapterMetadata.id is readonly.
meta.id = "x";

// ---- AdapterName is a closed union, not an arbitrary string ----
const good: AdapterName = "policy";
void good;
// @ts-expect-error "network" is not a known adapter name.
const bad: AdapterName = "network";
void bad;

// ---- A non-adapter object is not assignable to a frozen base interface ----
// @ts-expect-error a bare object is not a PolicyRepositoryAdapter.
const notPolicy: PolicyRepositoryAdapter = { metadata: { id: "x", testOnly: false, productionReady: true } };
void notPolicy;
