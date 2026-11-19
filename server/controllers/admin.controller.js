import {
  changeAdminPassword as updateAdminPassword,
  createAdminUser as addAdminUser,
  deactivateAdminUser as disableAdminUser,
  listAdminUsers as getAdminUsers,
  recordAdminLogin,
  resetAdminMfa as clearAdminMfa,
  updateAdminRole as saveAdminRole,
  validateAdminPassword,
} from "../services/admin.service.js";
import {
  beginAdminMfaSetup,
  completeAdminMfaSetup,
  getAdminMfaSetup,
  verifyAdminMfaLogin,
} from "../services/adminMfa.service.js";
import { getAdminPermissions } from "../services/adminPermissions.js";
import {
  clearSessionCookie,
  resolveAdminSession,
  setMfaSetupCookie,
  setSessionCookie,
} from "../services/session.service.js";

export function login(request, response) {
  const { username, password, code } = request.body ?? {};
  const admin = validateAdminPassword(username, password);
  if (!admin) {
    return response.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }

  if (admin.mfa_enabled !== 1) {
    const setup = beginAdminMfaSetup(admin.id);
    if (!setup) {
      return response.status(409).json({ error: "No se pudo iniciar la configuración del segundo factor." });
    }
    setMfaSetupCookie(response, admin);
    return response.json({ mfaSetupRequired: true });
  }

  if (typeof code !== "string" || code.length === 0) {
    return response.json({ twoFactorRequired: true });
  }

  const verification = verifyAdminMfaLogin(admin, code);
  if (!verification.verified) {
    return response.status(401).json({ error: "El código de segundo factor no es válido." });
  }

  recordAdminLogin(admin);
  setSessionCookie(response, admin);
  return response.json({
    authenticated: true,
    username: admin.username,
    role: admin.role,
    permissions: getAdminPermissions(admin.role),
    mustChangePassword: admin.must_change_password === 1,
  });
}

export function getSession(request, response) {
  const session = resolveAdminSession(request);
  if (session?.mfaSetupRequired) {
    return response.json({
      authenticated: false,
      mfaSetupRequired: true,
      username: session.username,
    });
  }
  response.json(session ?? { authenticated: false });
}

export function getMfaSetup(request, response) {
  const setup = getAdminMfaSetup(request.adminSetup.id);
  if (!setup) {
    return response.status(409).json({ error: "No hay una configuración pendiente del segundo factor." });
  }
  response.set("Cache-Control", "no-store");
  return response.json(setup);
}

export function verifyMfaSetup(request, response) {
  const result = completeAdminMfaSetup(request.adminSetup.id, request.body?.code);
  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  setSessionCookie(response, result.admin);
  return response.json({
    authenticated: true,
    username: result.admin.username,
    role: result.admin.role,
    permissions: getAdminPermissions(result.admin.role),
    mustChangePassword: result.admin.must_change_password === 1,
    recoveryCodes: result.recoveryCodes,
  });
}

export function logout(_request, response) {
  clearSessionCookie(response);
  response.status(204).end();
}

export function changePassword(request, response) {
  const result = updateAdminPassword(
    request.admin.id,
    request.body?.currentPassword,
    request.body?.newPassword,
  );

  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  clearSessionCookie(response);
  return response.json({ passwordChanged: true });
}

export function listUsers(_request, response) {
  response.json(getAdminUsers());
}

export function createUser(request, response) {
  const result = addAdminUser(request.body ?? {}, request.admin);
  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }
  return response.status(201).json(result);
}

export function updateUserRole(request, response) {
  const result = saveAdminRole(request.params.id, request.body?.role, request.admin);
  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }
  return response.json(result);
}

export function resetUserMfa(request, response) {
  const result = clearAdminMfa(request.params.id, request.admin);
  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }
  return response.json(result);
}

export function deactivateUser(request, response) {
  const result = disableAdminUser(request.params.id, request.admin);
  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }
  return response.json(result);
}
