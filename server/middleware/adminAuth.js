import { hasValidSession } from "../services/session.service.js";
import { config } from "../config/env.js";

export function requireAdmin(request, response, next) {
  if (!hasValidSession(request)) {
    return response.status(401).json({ error: "Inicia sesión para continuar." });
  }

  next();
}

export function requireSameOrigin(request, response, next) {
  if (request.get("origin") !== config.appOrigin) {
    return response.status(403).json({ error: "Origen de solicitud no permitido." });
  }

  next();
}
