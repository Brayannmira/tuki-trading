import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config/env.js";
import { getAdminByIdForSession } from "./admin.service.js";
import { getAdminPermissions } from "./adminPermissions.js";

const sessionCookieName = "tuki_admin_session";
const sessionDurationMs = 8 * 60 * 60 * 1000;
const setupDurationMs = 10 * 60 * 1000;

function getCookie(request, name) {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie?.slice(name.length + 1);
}

function signPayload(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", config.sessionSecret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function readPayload(request) {
  const token = getCookie(request, sessionCookieName);
  if (!token) return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expectedSignature = createHmac("sha256", config.sessionSecret).update(payload).digest();
  const providedSignature = Buffer.from(signature, "base64url");
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof session.userId !== "string" ||
      !Number.isSafeInteger(session.sessionVersion) ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Date.now()
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function resolveAdminSession(request) {
  const session = readPayload(request);
  if (!session) return null;

  const admin = getAdminByIdForSession(session.userId);
  if (!admin || admin.session_version !== session.sessionVersion) return null;

  if (session.setup === true) {
    if (admin.mfa_enabled === 1) return null;
    return {
      mfaSetupRequired: true,
      id: admin.id,
      username: admin.username,
    };
  }

  if (admin.mfa_enabled !== 1) return null;
  return {
    authenticated: true,
    id: admin.id,
    username: admin.username,
    role: admin.role,
    permissions: getAdminPermissions(admin.role),
    mustChangePassword: admin.must_change_password === 1,
  };
}

export function createAdminSessionToken(admin, { setup = false } = {}) {
  const durationMs = setup ? setupDurationMs : sessionDurationMs;
  return signPayload({
    userId: admin.id,
    sessionVersion: admin.session_version,
    setup,
    expiresAt: Date.now() + durationMs,
  });
}

export function hasValidSession(request) {
  return resolveAdminSession(request)?.authenticated === true;
}

export function hasValidMfaSetupSession(request) {
  return resolveAdminSession(request)?.mfaSetupRequired === true;
}

function setCookie(response, token, maxAge) {
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    maxAge,
    path: "/",
  });
}

export function setSessionCookie(response, admin) {
  setCookie(response, createAdminSessionToken(admin), sessionDurationMs);
}

export function setMfaSetupCookie(response, admin) {
  setCookie(response, createAdminSessionToken(admin, { setup: true }), setupDurationMs);
}

export function clearSessionCookie(response) {
  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    path: "/",
  });
}
