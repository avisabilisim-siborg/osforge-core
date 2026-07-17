/**
 * ServiceLumi surface foundation (web + mobile technician). Framework-free
 * view models and the tenant-bound offline sync gate. Projection only: this
 * layer derives views from records already authorized by the tenant-scoped
 * core and can never widen visibility. No UI framework, transport or
 * persistence dependency is added (SC16.4).
 */
export * from "./screens.js";
export * from "./mobile.js";
