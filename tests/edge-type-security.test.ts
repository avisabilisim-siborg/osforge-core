import type {
  CoreIngressRequest,
  AuthenticationContext,
  NormalizedEdgeRequest,
  RawEdgeRequest,
  ValidatedEdgeRequest
} from "../packages/edge-security/src/index.js";
import type { OSForgeContext } from "../packages/protocol/src/index.js";
import {
  createCoreIngressRequest,
  createRawEdgeRequest
} from "../packages/edge-security/src/index.js";

declare const validatedRequest: ValidatedEdgeRequest;
declare const coreIngressRequest: CoreIngressRequest;
declare const normalizedRequest: NormalizedEdgeRequest;
declare const authentication: AuthenticationContext;
declare const context: OSForgeContext;

createCoreIngressRequest(validatedRequest);
coreIngressRequest.edgeRequest;

// @ts-expect-error Plain objects cannot be treated as raw edge requests.
const forgedRaw: RawEdgeRequest = {
  method: "GET",
  path: "/",
  headers: {},
  actionClass: "standard"
};

// @ts-expect-error Plain objects cannot be treated as validated edge requests.
const forgedValidated: ValidatedEdgeRequest = {
  request: normalizedRequest,
  authentication,
  context
};

// @ts-expect-error Core ingress cannot be built from an unvalidated raw request.
createCoreIngressRequest(createRawEdgeRequest({
  method: "GET",
  path: "/",
  headers: {},
  actionClass: "standard"
}));
