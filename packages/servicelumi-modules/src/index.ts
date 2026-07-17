/**
 * ServiceLumi vertical service modules (Foundation): TV, computer, mobile
 * phone and white goods. Each is a declarative `ServiceModuleDefinition` for
 * the deny-by-default module system in `packages/servicelumi-core` — pure
 * data, no execution authority, no runtime wiring.
 */
import type { ServiceModuleDefinition } from "../../servicelumi-core/src/index.js";
import { TV_SERVICE_MODULE } from "./tv.js";
import { COMPUTER_SERVICE_MODULE } from "./computer.js";
import { PHONE_SERVICE_MODULE } from "./phone.js";
import { APPLIANCE_SERVICE_MODULE } from "./appliance.js";

export { TV_SERVICE_MODULE, COMPUTER_SERVICE_MODULE, PHONE_SERVICE_MODULE, APPLIANCE_SERVICE_MODULE };

export const ALL_SERVICE_MODULES: readonly ServiceModuleDefinition[] = Object.freeze([
  TV_SERVICE_MODULE,
  COMPUTER_SERVICE_MODULE,
  PHONE_SERVICE_MODULE,
  APPLIANCE_SERVICE_MODULE
]);
