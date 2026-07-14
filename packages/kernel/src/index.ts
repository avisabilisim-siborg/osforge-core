// Legacy protocol re-exports kept for backward compatibility. The protocol's
// minimal `KernelModule` placeholder is re-exported under an explicit alias so
// it does not collide with the kernel's real lifecycle `KernelModule`.
export type {
  AutonomousLoop,
  KernelModule as ProtocolKernelModule,
  OSForgeContext,
  OrchestrationResult
} from "#protocol";

// Clock & ids
export type { IdFactory, KernelClock } from "./clock.js";
export { FixedKernelClock, SequentialIdFactory, SystemKernelClock } from "./clock.js";

// Health
export type { HealthReport, HealthStatus, KernelHealth } from "./health.js";
export { aggregateHealth, isHealthStatus } from "./health.js";

// Observability
export type {
  KernelAuditRecord,
  KernelAuditSink,
  LogLevel,
  LogSink,
  MetricSink,
  Observability,
  TraceSink,
  TraceSpan
} from "./observability.js";
export {
  createDefaultObservability,
  InMemoryKernelAuditSink,
  InMemoryLogSink,
  InMemoryMetricSink,
  NoopTraceSink
} from "./observability.js";

// Event bus
export type {
  DeadLetter,
  EventBus,
  EventEnvelope,
  EventHandler,
  PublishInput,
  Subscription,
  SubscribeOptions
} from "./event-bus.js";
export { InMemoryEventBus } from "./event-bus.js";

// Module & lifecycle
export type { KernelModule, ModuleId, ModuleKind, ModuleMetadata, ModuleServices } from "./module.js";
export { BaseKernelModule, KIND_BOOT_PRIORITY, isKernelModule } from "./module.js";

// Registry
export { ModuleRegistry } from "./registry.js";

// Dependency graph
export type { DependencyResolution } from "./dependency-graph.js";
export { resolveBootOrder, resolveShutdownOrder } from "./dependency-graph.js";

// Crash recovery
export type { CrashContext, RestartDecision, RestartPolicy } from "./crash-recovery.js";
export { BoundedRestartPolicy, NeverRestartPolicy } from "./crash-recovery.js";

// Kernel engine
export type { BootResult, KernelOptions, KernelState, ShutdownResult } from "./kernel.js";
export { Kernel } from "./kernel.js";

// Domain contracts (interfaces only)
export type {
  PluginManifest,
  PluginPermissionRequest,
  PluginSandboxRequirement,
  PluginSignature,
  PluginVerifier,
  SignedPlugin
} from "./contracts/plugin.js";
export type {
  MemoryProvenance,
  MemoryQuery,
  MemoryRecord,
  MemoryScope,
  MemoryStore,
  MemoryWriteResult
} from "./contracts/memory.js";
export type {
  Connector,
  ConnectorIdentity,
  ConnectorKind,
  ConnectorOutputClassification,
  ConnectorRegistry,
  ConnectorRequest,
  ConnectorResponse
} from "./contracts/connector.js";
export type {
  ModelGateway,
  ModelMessage,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelUsage
} from "./contracts/model-gateway.js";
export type {
  Agent,
  Assistant,
  DigitalEmployee,
  DigitalEmployeeIdentity,
  DigitalEmployeeRoleKind,
  Skill,
  SupervisionMode,
  WorkflowEmployee
} from "./contracts/digital-employee.js";
export { FORBIDDEN_DIGITAL_EMPLOYEE_ROLES } from "./contracts/digital-employee.js";
