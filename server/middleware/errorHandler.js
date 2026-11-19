import { serializeError, writeLog } from "../utils/logger.js";

export function errorHandler(error, request, response, _next) {
  void _next;
  if (error.type === "entity.too.large") {
    return response.status(413).json({ error: "El cuerpo de la solicitud excede el tamaño permitido." });
  }
  if (error instanceof SyntaxError && "body" in error) {
    return response.status(400).json({ error: "El cuerpo de la solicitud no es JSON válido." });
  }

  writeLog("error", "http.request.failed", {
    requestId: request.requestId,
    method: request.method,
    path: request.path,
    error: serializeError(error),
  });
  response.status(500).json({ error: "Ocurrió un error interno." });
}
