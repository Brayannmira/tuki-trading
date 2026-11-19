import {
  resolveAdminSession,
} from "../services/session.service.js";
import { config } from "../config/env.js";

export function requireAdmin(request, response, next) {
  const admin = resolveAdminSession(request);
  if (!admin?.authenticated) {
    return response.status(401).json({ error: "Inicia sesión para continuar." });
  }

  request.admin = admin;
  if (admin.mustChangePassword && request.path !== "/password") {
    return response.status(403).json({
      error: "Cambia tu contraseña inicial antes de acceder al panel.",
      passwordChangeRequired: true,
    });
  }
  next();
}

export function requireMfaSetup(request, response, next) {
  const admin = resolveAdminSession(request);
  if (!admin?.mfaSetupRequired) {
    return response.status(401).json({ error: "Inicia sesión para configurar el segundo factor." });
  }
  request.adminSetup = admin;
  next();
}

export function requirePermission(permission) {
  return (request, response, next) => {
    if (!request.admin?.permissions.includes(permission)) {
      return response.status(403).json({ error: "No tienes permiso para realizar esta acción." });
    }
    next();
  };
}

export function requireOwner(request, response, next) {
  if (request.admin?.role !== "owner") {
    return response.status(403).json({ error: "Esta acción está reservada al propietario." });
  }
  next();
}

export function requireSameOrigin(request, response, next) {
  if (request.get("origin") !== config.appOrigin) {
    return response.status(403).json({ error: "Origen de solicitud no permitido." });
  }

  next();
}
