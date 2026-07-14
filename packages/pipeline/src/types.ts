export type RuntimeMode = "test" | "production";

export type AuthenticationLevel = "none" | "aal1" | "aal2" | "aal3";

export type PipelineRiskLevel = "low" | "medium" | "high" | "critical";

export interface ResourceRef {
  id: string;
  type: string;
}

const AUTHENTICATION_LEVEL_RANK: Record<AuthenticationLevel, number> = {
  none: 0,
  aal1: 1,
  aal2: 2,
  aal3: 3
};

export function meetsAuthenticationLevel(
  actual: AuthenticationLevel,
  required: AuthenticationLevel
): boolean {
  return AUTHENTICATION_LEVEL_RANK[actual] >= AUTHENTICATION_LEVEL_RANK[required];
}
