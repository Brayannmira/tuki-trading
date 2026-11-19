import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
} from "node:crypto";
import { config } from "../config/env.js";
import {
  deleteCustomerSession,
  removeCustomerLoginCode,
  saveCustomerLoginCode,
  selectCustomerBySession,
  selectCustomerOrders,
  verifyCustomerLoginCode as consumeCustomerLoginCode,
} from "../repositories/customers.repository.js";

const customerSessionCookieName = "tuki_customer_session";
const customerSessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const customerLoginCodeDurationMs = 10 * 60 * 1000;
const customerLoginCodeCooldownMs = 60 * 1000;

export function normalizeCustomerEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidCustomerEmail(email) {
  const normalizedEmail = normalizeCustomerEmail(email);
  return normalizedEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
}

function hashLoginCode(email, code) {
  return createHmac("sha256", config.sessionSecret)
    .update("tuki-customer-login-code:")
    .update(email)
    .update(":")
    .update(code)
    .digest("hex");
}

function hashSessionToken(token) {
  return createHash("sha256")
    .update("tuki-customer-session:")
    .update(token)
    .digest("hex");
}

function getCustomerSessionToken(request) {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${customerSessionCookieName}=`));
  const token = cookie?.slice(customerSessionCookieName.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function requestCustomerLoginCode(email) {
  if (!config.smtp) {
    return {
      error: "El acceso por correo no está disponible hasta configurar SMTP.",
      statusCode: 503,
    };
  }

  const normalizedEmail = normalizeCustomerEmail(email);
  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const codeHash = hashLoginCode(normalizedEmail, code);
  const requestedAt = new Date();
  const requestedAtIso = requestedAt.toISOString();
  const saved = saveCustomerLoginCode(
    normalizedEmail,
    codeHash,
    requestedAtIso,
    new Date(requestedAt.getTime() + customerLoginCodeDurationMs).toISOString(),
    new Date(requestedAt.getTime() - customerLoginCodeCooldownMs).toISOString(),
  );

  if (!saved) return { accepted: true };

  try {
    const { sendCustomerLoginCode } = await import("./smtp.service.js");
    await sendCustomerLoginCode({ recipient: normalizedEmail, code });
  } catch {
    removeCustomerLoginCode(normalizedEmail, codeHash);
    console.error("No se pudo enviar un código de acceso al cliente.");
    return {
      error: "No se pudo enviar el código. Inténtalo más tarde.",
      statusCode: 503,
    };
  }

  return { accepted: true };
}

export function verifyCustomerLoginCode(email, code) {
  const normalizedEmail = normalizeCustomerEmail(email);
  if (typeof code !== "string" || !/^\d{8}$/.test(code)) {
    return { error: "El código no es válido o venció.", statusCode: 401 };
  }

  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const customer = consumeCustomerLoginCode({
    email: normalizedEmail,
    candidateHash: hashLoginCode(normalizedEmail, code),
    now: now.toISOString(),
    customerId: randomUUID(),
    sessionTokenHash: hashSessionToken(token),
    sessionExpiresAt: new Date(now.getTime() + customerSessionDurationMs).toISOString(),
  });

  if (!customer) {
    return { error: "El código no es válido o venció.", statusCode: 401 };
  }

  return { token, email: customer.email };
}
export function resolveCustomerSession(request) {
  const token = getCustomerSessionToken(request);
  if (!token) return null;

  const customer = selectCustomerBySession(
    hashSessionToken(token),
    new Date().toISOString(),
  );
  return customer ? { ...customer, token } : null;
}

export function revokeCustomerSession(request) {
  const token = getCustomerSessionToken(request);
  if (token) deleteCustomerSession(hashSessionToken(token));
}

export function getCustomerOrders(email, pagination) {
  return selectCustomerOrders(normalizeCustomerEmail(email), pagination);
}

export function setCustomerSessionCookie(response, token) {
  response.cookie(customerSessionCookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    maxAge: customerSessionDurationMs,
    path: "/",
  });
}

export function clearCustomerSessionCookie(response) {
  response.clearCookie(customerSessionCookieName, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    path: "/",
  });
}

