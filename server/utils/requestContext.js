import { AsyncLocalStorage } from "node:async_hooks";

const requestContext = new AsyncLocalStorage();

export function withRequestId(requestId, callback) {
  return requestContext.run({ requestId }, callback);
}

export function getRequestId() {
  return requestContext.getStore()?.requestId ?? null;
}
