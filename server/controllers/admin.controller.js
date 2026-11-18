import {
  changeAdminPassword as updateAdminPassword,
  hasValidAdminCredentials,
} from "../services/admin.service.js";
import {
  clearSessionCookie,
  hasValidSession,
  setSessionCookie,
} from "../services/session.service.js";

export function login(request, response) {
  const { username, password } = request.body ?? {};

  if (!hasValidAdminCredentials(username, password)) {
    return response.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }

  setSessionCookie(response);
  response.json({ authenticated: true });
}

export function getSession(request, response) {
  response.json({ authenticated: hasValidSession(request) });
}

export function logout(_request, response) {
  clearSessionCookie(response);
  response.status(204).end();
}

export function changePassword(request, response) {
  const result = updateAdminPassword(
    request.body?.currentPassword,
    request.body?.newPassword,
  );

  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  clearSessionCookie(response);
  return response.json({ passwordChanged: true });
}
