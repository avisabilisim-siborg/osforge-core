/**
 * ServiceLumi application layer (local vertical slice). Composes the governed
 * core with an explicitly test-only session shell, deterministic voice command
 * service (Lumi Voice contracts, human approval for state changes) and a
 * development OCR service (untrusted drafts, human confirmation). No
 * production adapter, transport or persistence lives here.
 */
export * from "./session.js";
export * from "./flags.js";
export * from "./voice.js";
export * from "./ocr.js";
export * from "./app.js";
