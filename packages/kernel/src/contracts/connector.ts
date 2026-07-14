/**
 * Connector contract (requirement §16). CONTRACT ONLY — no real connector is
 * implemented. Google, WhatsApp, Stripe, Supabase, MCP and Email all speak this
 * one API. Every connector call is scoped to a tenant/workspace and is untrusted
 * output until validated (Constitution §17). Real connectors are gated on the
 * Tool/MCP Security Boundary (roadmap Sprint 11).
 */
export type ConnectorKind = "google" | "whatsapp" | "stripe" | "supabase" | "mcp" | "email";

export interface ConnectorIdentity {
  connectorId: string;
  kind: ConnectorKind;
  tenantId: string;
  workspaceId: string;
}

export interface ConnectorRequest {
  identity: ConnectorIdentity;
  operation: string;
  input: Record<string, unknown>;
  correlationId: string;
}

export type ConnectorOutputClassification = "trusted" | "untrusted";

export interface ConnectorResponse {
  ok: boolean;
  classification: ConnectorOutputClassification;
  output?: Record<string, unknown>;
  error?: string;
}

export interface Connector {
  readonly kind: ConnectorKind;
  invoke(request: ConnectorRequest): Promise<ConnectorResponse>;
}

export interface ConnectorRegistry {
  register(connector: Connector): void;
  get(kind: ConnectorKind): Connector | undefined;
}
