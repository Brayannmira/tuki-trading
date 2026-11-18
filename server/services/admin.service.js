import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../config/env.js";
import database from "../db/database.js";

const passwordKeyLength = 64;

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, passwordKeyLength);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function isPasswordMatch(password, storedHash) {
  const [saltHex, hashHex, extra] = storedHash.split(":");
  if (!saltHex || !hashHex || extra) return false;

  const expectedHash = Buffer.from(hashHex, "hex");
  const actualHash = scryptSync(password, Buffer.from(saltHex, "hex"), passwordKeyLength);
  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
}

function getCredentials() {
  return database.prepare(`
    SELECT password_hash, session_version
    FROM admin_credentials
    WHERE id = 1
  `).get();
}

function constantTimeEqual(first, second) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

if (!getCredentials()) {
  database.prepare(`
    INSERT INTO admin_credentials (id, password_hash, updated_at)
    VALUES (1, ?, ?)
  `).run(hashPassword(config.adminPassword), new Date().toISOString());
}

export function hasValidAdminCredentials(username, password) {
  return (
    typeof username === "string" &&
    typeof password === "string" &&
    constantTimeEqual(username, config.adminUsername) &&
    isPasswordMatch(password, getCredentials().password_hash)
  );
}

export function getAdminSessionVersion() {
  return getCredentials().session_version;
}

export function changeAdminPassword(currentPassword, newPassword) {
  if (
    typeof currentPassword !== "string" ||
    currentPassword.length > 128 ||
    typeof newPassword !== "string"
  ) {
    return { error: "Completa las contraseñas solicitadas.", statusCode: 400 };
  }

  if (newPassword.length < 12 || newPassword.length > 128) {
    return {
      error: "La nueva contraseña debe tener entre 12 y 128 caracteres.",
      statusCode: 400,
    };
  }

  const credentials = getCredentials();
  if (!isPasswordMatch(currentPassword, credentials.password_hash)) {
    return { error: "La contraseña actual no es correcta.", statusCode: 400 };
  }

  if (currentPassword === newPassword) {
    return { error: "La nueva contraseña debe ser diferente a la actual.", statusCode: 400 };
  }

  database.prepare(`
    UPDATE admin_credentials
    SET password_hash = ?, session_version = session_version + 1, updated_at = ?
    WHERE id = 1
  `).run(hashPassword(newPassword), new Date().toISOString());

  return { changed: true };
}
