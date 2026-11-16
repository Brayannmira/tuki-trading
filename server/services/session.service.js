import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config/env.js";

const sessionCookieName = "tuki_admin_session";
const sessionDurationMs = 8 * 60 * 60 * 1000;

function getCookie(request, name) {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie?.slice(name.length + 1);
}

function createSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({ expiresAt: Date.now() + sessionDurationMs }),
  ).toString("base64url");
  const signature = createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");

  return `${payload}.${signature}`;
}

export function hasValidSession(request) {
  const token = getCookie(request, sessionCookieName);
  if (!token) return false;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;

  const expectedSignature = createHmac("sha256", config.sessionSecret).update(payload).digest();
  const providedSignature = Buffer.from(signature, "base64url");
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(session.expiresAt) && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export function setSessionCookie(response) {
  response.cookie(sessionCookieName, createSessionToken(), {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    maxAge: sessionDurationMs,
    path: "/",
  });
}

export function clearSessionCookie(response) {
  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    path: "/",
  });
}
