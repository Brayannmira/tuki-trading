import { hasValidSession } from "../services/session.service.js";

export function requireAdmin(request, response, next) {
  if (!hasValidSession(request)) {
    return response.status(401).json({ error: "Inicia sesión para continuar." });
  }

  next();
}
