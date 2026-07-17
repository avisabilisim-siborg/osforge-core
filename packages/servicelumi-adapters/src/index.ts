/**
 * ServiceLumi adapters (Foundation): safe seams that bind the repair-shop
 * product line to existing OSForge Core capabilities. Voice reuses the
 * canonical Lumi Voice contracts (`packages/agent-runtime`, PTT-only); vision
 * reuses the content-trust taxonomy (`OCR_EXTRACTED` ⇒ UNTRUSTED). Both only
 * ever produce untrusted drafts that a human confirms — adapters never create
 * records and never grant authority.
 */
export * from "./voice-intake.js";
export * from "./vision-intake.js";
