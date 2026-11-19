import { getRequestId } from "./requestContext.js";

export function serializeError(error) {
  if (!(error instanceof Error)) {
    return { name: "Error", message: String(error) };
  }

  return {
    name: error.name,
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.stack ? { stack: error.stack } : {}),
  };
}

export function writeLog(level, event, details = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  };
  const requestId = getRequestId();
  if (requestId) record.requestId = requestId;

  const output = JSON.stringify(record);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}
