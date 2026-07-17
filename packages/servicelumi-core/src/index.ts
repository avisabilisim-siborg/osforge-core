/**
 * ServiceLumi Core (Foundation). Shared tenant-bound customer / device /
 * work-order domain plus the deny-by-default vertical module system for the
 * modular electronics repair-shop product line. Contract + in-memory reference
 * only: no runtime wiring, no database, no migration, no production logic.
 * Composes — never redefines — the canonical tenancy contracts in
 * `packages/tenant-boundary` and `packages/protocol` (ADR 0016), and never
 * produces an authorization (ADR 0017).
 *
 * See docs/servicelumi/ARCHITECTURE.md.
 */
export * from "./types.js";
export * from "./module.js";
export * from "./customer.js";
export * from "./device.js";
export * from "./workorder.js";
export * from "./core.js";
