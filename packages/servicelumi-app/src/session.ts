/**
 * ServiceLumi application sessions — DEVELOPMENT SHELL. This is NOT the
 * production identity system: it is an explicitly test-only stand-in so the
 * vertical slice can run locally. Production sign-in binds to the OSForge
 * identity layer (`packages/identity`, `identity-trust`) through the mandatory
 * security chain (S4.1); this shell must be rejected there
 * (`assertNotTestReferenceInProduction`).
 */

import type { ActorId, TenantScope } from "../../tenant-boundary/src/index.js";
import { actorId, organizationId, tenantId, workspaceId } from "../../tenant-boundary/src/index.js";

export type AppRole = "OWNER" | "RECEPTION" | "TECHNICIAN";

export interface AppUser {
  readonly id: ActorId;
  readonly displayName: string;
  readonly role: AppRole;
}

export interface AppTenantOption {
  readonly scope: TenantScope;
  readonly label: string;
}

export interface AppSession {
  readonly sessionId: string;
  readonly user: AppUser;
  readonly scope: TenantScope;
  readonly locale: "tr" | "en";
  readonly theme: "dark" | "light";
}

/** Adapter-guard metadata: this session shell is test-only, never production. */
export const SESSION_SHELL_METADATA = Object.freeze({
  id: "servicelumi-demo-session-shell",
  testOnly: true,
  productionReady: false
});

export const DEMO_USERS: readonly AppUser[] = Object.freeze([
  Object.freeze({ id: actorId("user-owner"), displayName: "Servis Sahibi (Owner)", role: "OWNER" as const }),
  Object.freeze({ id: actorId("user-reception"), displayName: "Resepsiyon (Front Desk)", role: "RECEPTION" as const }),
  Object.freeze({ id: actorId("user-tech"), displayName: "Teknisyen (Technician)", role: "TECHNICIAN" as const })
]);

export const DEMO_TENANTS: readonly AppTenantOption[] = Object.freeze([
  Object.freeze({
    scope: Object.freeze({
      tenantId: tenantId("tenant-merkez"),
      organizationId: organizationId("org-servicelumi-demo"),
      workspaceId: workspaceId("ws-merkez-sube")
    }),
    label: "Merkez Şube (Demo)"
  }),
  Object.freeze({
    scope: Object.freeze({
      tenantId: tenantId("tenant-sanayi"),
      organizationId: organizationId("org-servicelumi-demo-2"),
      workspaceId: workspaceId("ws-sanayi-sube")
    }),
    label: "Sanayi Şube (Demo)"
  })
]);

/** In-memory session registry for the development shell. */
export class SessionRegistry {
  readonly #sessions = new Map<string, AppSession>();
  #counter = 0;

  open(userId: string, scope: TenantScope, locale: "tr" | "en", theme: "dark" | "light"): AppSession | undefined {
    const user = DEMO_USERS.find((u) => u.id === userId);
    if (user === undefined) {
      return undefined;
    }
    this.#counter += 1;
    const session: AppSession = Object.freeze({ sessionId: `s-${this.#counter}`, user, scope, locale, theme });
    this.#sessions.set(session.sessionId, session);
    return session;
  }

  get(sessionId: string | undefined): AppSession | undefined {
    return sessionId === undefined ? undefined : this.#sessions.get(sessionId);
  }

  update(sessionId: string, patch: Partial<Pick<AppSession, "locale" | "theme" | "scope">>): AppSession | undefined {
    const current = this.#sessions.get(sessionId);
    if (current === undefined) {
      return undefined;
    }
    const next: AppSession = Object.freeze({ ...current, ...patch });
    this.#sessions.set(sessionId, next);
    return next;
  }

  close(sessionId: string): void {
    this.#sessions.delete(sessionId);
  }
}
