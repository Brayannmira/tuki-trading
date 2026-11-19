import { randomUUID } from "node:crypto";
import { writeLog } from "../utils/logger.js";
import { withRequestId } from "../utils/requestContext.js";

export function requestLogger(request, response, next) {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();
  const path = request.originalUrl?.split("?")[0] ?? request.path;
  request.requestId = requestId;
  response.setHeader("X-Request-ID", requestId);

  return withRequestId(requestId, () => {
    response.once("finish", () => {
      const statusCode = response.statusCode;
      const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      writeLog(level, "http.request.completed", {
        requestId,
        method: request.method,
        path,
        statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  });
}
