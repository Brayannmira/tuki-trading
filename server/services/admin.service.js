import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../config/env.js";
import database from "../db/database.js";

export const adminRoles = ["owner", "orders", "catalog", "viewer"];
const passwordKeyLength = 64;
const dummyPasswordHash = hashPassword("tuki-dummy-admin-password");

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, passwordKeyLength);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function isPasswordMatch(password, storedHash) {
  if (typeof storedHash !== "string") return false;
  const [saltHex, hashHex, extra] = storedHash.split(":");
  if (!saltHex || !hashHex || extra) return false;

  const expectedHash = Buffer.from(hashHex, "hex");
  const actualHash = scryptSync(password, Buffer.from(saltHex, "hex"), passwordKeyLength);
  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
}

function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

function getLegacyCredentials() {
  return database.prepare(`
    SELECT password_hash
    FROM admin_credentials
    WHERE id = 1
  `).get();
}

function getAdminById(id) {
  return database.prepare(`
    SELECT id, username, password_hash, role, active, mfa_enabled,
      totp_secret_encrypted, last_totp_step, must_change_password,
      session_version, created_at, updated_at
    FROM admin_users
    WHERE id = ?
  `).get(id);
}

function getActiveOwnerCount() {
  return database.prepare(`
    SELECT COUNT(*) AS count
    FROM admin_users
    WHERE role = 'owner' AND active = 1
  `).get().count;
}

function writeAudit(actor, action, entityId, details = null) {
  database.prepare(`
    INSERT INTO admin_audit_log (actor, action, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(actor, action, entityId, details ? JSON.stringify(details) : null, new Date().toISOString());
}

const existingAdmins = database.prepare("SELECT COUNT(*) AS count FROM admin_users").get().count;
if (existingAdmins === 0) {
  const legacyCredentials = getLegacyCredentials();
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO admin_users (
      id, username, password_hash, role, active, mfa_enabled,
      must_change_password, session_version, created_at, updated_at
    )
    VALUES (?, ?, ?, 'owner', 1, 0, 0, 0, ?, ?)
  `).run(
    randomUUID(),
    normalizeUsername(config.adminUsername),
    legacyCredentials?.password_hash ?? hashPassword(config.adminPassword),
    now,
    now,
  );
}

export function getAdminByUsername(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;
  return database.prepare(`
    SELECT id, username, password_hash, role, active, mfa_enabled,
      totp_secret_encrypted, last_totp_step, must_change_password,
      session_version, created_at, updated_at
    FROM admin_users
    WHERE username = ?
  `).get(normalizedUsername) ?? null;
}

export function getAdminByIdForSession(id) {
  const admin = getAdminById(id);
  if (!admin || admin.active !== 1) return null;
  return admin;
}

export function validateAdminPassword(username, password) {
  if (typeof password !== "string" || password.length > 128) return null;
  const normalizedUsername = normalizeUsername(username);
  const admin = normalizedUsername
    ? database.prepare(`
      SELECT id, username, password_hash, role, active, mfa_enabled,
        totp_secret_encrypted, last_totp_step, must_change_password,
        session_version, created_at, updated_at
      FROM admin_users
      WHERE username = ?
    `).get(normalizedUsername)
    : null;

  const passwordMatches = isPasswordMatch(password, admin?.password_hash ?? dummyPasswordHash);
  if (!admin || admin.active !== 1 || !passwordMatches) {
    return null;
  }
  return admin;
}

export function changeAdminPassword(adminId, currentPassword, newPassword) {
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

  const admin = getAdminById(adminId);
  if (!admin || admin.active !== 1 || !isPasswordMatch(currentPassword, admin.password_hash)) {
    return { error: "La contraseña actual no es correcta.", statusCode: 400 };
  }

  if (currentPassword === newPassword) {
    return { error: "La nueva contraseña debe ser diferente a la actual.", statusCode: 400 };
  }

  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      UPDATE admin_users
      SET password_hash = ?, must_change_password = 0,
        session_version = session_version + 1, updated_at = ?
      WHERE id = ?
    `).run(hashPassword(newPassword), now, adminId);
    writeAudit(admin.username, "admin.password_changed", adminId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { changed: true };
}

export function listAdminUsers() {
  return database.prepare(`
    SELECT id, username, role, active, mfa_enabled, must_change_password,
      created_at, updated_at
    FROM admin_users
    ORDER BY created_at ASC, username ASC
  `).all();
}

export function createAdminUser({ username, password, role }, actor) {
  const normalizedUsername = normalizeUsername(username);
  if (!/^[a-z0-9._-]{3,32}$/.test(normalizedUsername)) {
    return { error: "El usuario debe tener de 3 a 32 caracteres: letras, números, punto, guion o guion bajo.", statusCode: 400 };
  }
  if (!adminRoles.includes(role)) {
    return { error: "El rol seleccionado no es válido.", statusCode: 400 };
  }
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return { error: "La contraseña inicial debe tener entre 12 y 128 caracteres.", statusCode: 400 };
  }
  if (getAdminByUsername(normalizedUsername)) {
    return { error: "Ya existe un administrador con ese usuario.", statusCode: 409 };
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO admin_users (
        id, username, password_hash, role, active, mfa_enabled,
        must_change_password, session_version, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 1, 0, 1, 0, ?, ?)
    `).run(id, normalizedUsername, hashPassword(password), role, now, now);
    writeAudit(actor.username, "admin.user_created", id, { username: normalizedUsername, role });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { error: "Ya existe un administrador con ese usuario.", statusCode: 409 };
    }
    throw error;
  }

  return { created: true, user: { id, username: normalizedUsername, role } };
}

export function updateAdminRole(id, role, actor) {
  if (!adminRoles.includes(role)) {
    return { error: "El rol seleccionado no es válido.", statusCode: 400 };
  }
  if (id === actor.id) {
    return { error: "No puedes cambiar tu propio rol.", statusCode: 400 };
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    const target = getAdminById(id);
    if (!target || target.active !== 1) {
      database.exec("ROLLBACK");
      return { error: "No se encontró un administrador activo.", statusCode: 404 };
    }
    if (target.role === role) {
      database.exec("COMMIT");
      return { updated: true };
    }
    if (target.role === "owner" && role !== "owner" && getActiveOwnerCount() <= 1) {
      database.exec("ROLLBACK");
      return { error: "Debe permanecer al menos un propietario activo.", statusCode: 409 };
    }

    const now = new Date().toISOString();
    database.prepare(`
      UPDATE admin_users
      SET role = ?, session_version = session_version + 1, updated_at = ?
      WHERE id = ?
    `).run(role, now, id);
    writeAudit(actor.username, "admin.user_role_changed", id, {
      username: target.username,
      from: target.role,
      to: role,
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { updated: true };
}

export function resetAdminMfa(id, actor) {
  if (id === actor.id) {
    return { error: "No puedes restablecer tu propio segundo factor.", statusCode: 400 };
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    const target = getAdminById(id);
    if (!target || target.active !== 1) {
      database.exec("ROLLBACK");
      return { error: "No se encontró un administrador activo.", statusCode: 404 };
    }

    database.prepare(`
      UPDATE admin_users
      SET mfa_enabled = 0, totp_secret_encrypted = NULL, last_totp_step = -1,
        session_version = session_version + 1, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);
    database.prepare("DELETE FROM admin_recovery_codes WHERE admin_id = ?").run(id);
    writeAudit(actor.username, "admin.user_mfa_reset", id, { username: target.username });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { reset: true };
}

export function deactivateAdminUser(id, actor) {
  if (id === actor.id) {
    return { error: "No puedes desactivar tu propia cuenta.", statusCode: 400 };
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    const target = getAdminById(id);
    if (!target || target.active !== 1) {
      database.exec("ROLLBACK");
      return { error: "No se encontró un administrador activo.", statusCode: 404 };
    }
    if (target.role === "owner" && getActiveOwnerCount() <= 1) {
      database.exec("ROLLBACK");
      return { error: "Debe permanecer al menos un propietario activo.", statusCode: 409 };
    }

    database.prepare(`
      UPDATE admin_users
      SET active = 0, session_version = session_version + 1, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);
    database.prepare("DELETE FROM admin_recovery_codes WHERE admin_id = ?").run(id);
    writeAudit(actor.username, "admin.user_deactivated", id, { username: target.username });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { deactivated: true };
}

export function recordAdminLogin(admin) {
  writeAudit(admin.username, "admin.login", admin.id, { role: admin.role });
}

export function recordAdminMfaEnrolled(admin) {
  writeAudit(admin.username, "admin.mfa_enrolled", admin.id);
}

export function recordRecoveryCodeUsed(admin) {
  writeAudit(admin.username, "admin.mfa_recovery_used", admin.id);
}

export function createPasswordHash(password) {
  return hashPassword(password);
}

export function verifyPassword(password, passwordHash) {
  return typeof password === "string" && isPasswordMatch(password, passwordHash);
}

export function updateAdminMfaSetup(adminId, encryptedSecret) {
  database.prepare(`
    UPDATE admin_users
    SET totp_secret_encrypted = ?, updated_at = ?
    WHERE id = ? AND active = 1 AND mfa_enabled = 0
  `).run(encryptedSecret, new Date().toISOString(), adminId);
}

export function enableAdminMfa(adminId, totpStep, recoveryCodeHashes) {
  const admin = getAdminById(adminId);
  if (!admin || admin.active !== 1 || admin.mfa_enabled === 1) return null;

  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    const updated = database.prepare(`
      UPDATE admin_users
      SET mfa_enabled = 1, last_totp_step = ?, updated_at = ?
      WHERE id = ? AND active = 1 AND mfa_enabled = 0
    `).run(totpStep, now, adminId);
    if (updated.changes !== 1) {
      database.exec("ROLLBACK");
      return null;
    }
    const insertRecoveryCode = database.prepare(`
      INSERT INTO admin_recovery_codes (admin_id, code_hash, created_at)
      VALUES (?, ?, ?)
    `);
    for (const codeHash of recoveryCodeHashes) {
      insertRecoveryCode.run(adminId, codeHash, now);
    }
    recordAdminMfaEnrolled(admin);
    database.exec("COMMIT");
    return getAdminById(adminId);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function consumeAdminTotpStep(adminId, totpStep) {
  const result = database.prepare(`
    UPDATE admin_users
    SET last_totp_step = ?, updated_at = ?
    WHERE id = ? AND active = 1 AND mfa_enabled = 1 AND last_totp_step < ?
  `).run(totpStep, new Date().toISOString(), adminId, totpStep);
  return result.changes === 1;
}

export function consumeAdminRecoveryCode(admin, codeHash) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = database.prepare(`
      DELETE FROM admin_recovery_codes
      WHERE admin_id = ? AND code_hash = ?
    `).run(admin.id, codeHash);
    if (result.changes === 1) recordRecoveryCodeUsed(admin);
    database.exec("COMMIT");
    return result.changes === 1;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
