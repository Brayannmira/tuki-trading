import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { config } from "../config/env.js";
import database from "../db/database.js";
import {
  consumeAdminRecoveryCode,
  consumeAdminTotpStep,
  enableAdminMfa,
  updateAdminMfaSetup,
} from "./admin.service.js";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const totpPeriodSeconds = 30;
const recoveryCodeCount = 10;

function getEncryptionKey() {
  return createHmac("sha256", config.adminMfaEncryptionKey)
    .update("tuki-admin-totp-encryption-v1")
    .digest();
}

function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value) {
  let bits = 0;
  let buffer = 0;
  const output = [];
  for (const character of value.toUpperCase().replace(/=+$/, "")) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid Base32 value.");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
      buffer &= (1 << bits) - 1;
    }
  }
  return Buffer.from(output);
}

function encryptSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptSecret(encryptedValue) {
  const [ivValue, tagValue, contentValue, extra] = encryptedValue?.split(".") ?? [];
  if (!ivValue || !tagValue || !contentValue || extra) {
    throw new Error("Invalid encrypted TOTP secret.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(contentValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getAdminMfaRecord(adminId) {
  return database.prepare(`
    SELECT id, username, role, active, mfa_enabled,
      totp_secret_encrypted, last_totp_step
    FROM admin_users
    WHERE id = ?
  `).get(adminId);
}

function createTotpUri(username, secret) {
  const issuer = "Tuki Trading";
  const label = `${issuer}:${username}`;
  const parameters = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: String(totpPeriodSeconds),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${parameters.toString()}`;
}

export function createTotpCode(secret, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary =
    ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(secret, code, lastAcceptedStep = -1, now = Date.now()) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return null;
  const currentStep = Math.floor(now / (totpPeriodSeconds * 1000));
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    if (step <= lastAcceptedStep) continue;
    const expectedCode = Buffer.from(createTotpCode(secret, step));
    const suppliedCode = Buffer.from(code);
    if (timingSafeEqual(expectedCode, suppliedCode)) return step;
  }
  return null;
}

function hashRecoveryCode(code) {
  return createHmac("sha256", config.adminMfaEncryptionKey)
    .update(`tuki-admin-recovery-v1:${code.toLowerCase().replace(/[\s-]/g, "")}`)
    .digest("hex");
}

export function beginAdminMfaSetup(adminId) {
  const admin = getAdminMfaRecord(adminId);
  if (!admin || admin.active !== 1 || admin.mfa_enabled === 1) return null;

  const secret = admin.totp_secret_encrypted
    ? decryptSecret(admin.totp_secret_encrypted)
    : encodeBase32(randomBytes(20));
  if (!admin.totp_secret_encrypted) {
    updateAdminMfaSetup(adminId, encryptSecret(secret));
  }
  return {
    username: admin.username,
    secret,
    otpauthUri: createTotpUri(admin.username, secret),
  };
}

export function completeAdminMfaSetup(adminId, code) {
  const admin = getAdminMfaRecord(adminId);
  if (
    !admin ||
    admin.active !== 1 ||
    admin.mfa_enabled === 1 ||
    !admin.totp_secret_encrypted
  ) {
    return { error: "No hay una configuración de segundo factor pendiente.", statusCode: 400 };
  }

  const secret = decryptSecret(admin.totp_secret_encrypted);
  const step = verifyTotpCode(secret, code, admin.last_totp_step);
  if (step === null) {
    return { error: "El código no es válido o ya fue utilizado.", statusCode: 400 };
  }

  const recoveryCodes = Array.from({ length: recoveryCodeCount }, () =>
    randomBytes(10).toString("hex"),
  );
  const enabledAdmin = enableAdminMfa(
    adminId,
    step,
    recoveryCodes.map(hashRecoveryCode),
  );
  if (!enabledAdmin) {
    return { error: "No se pudo completar la configuración. Inicia el proceso nuevamente.", statusCode: 409 };
  }
  return { admin: enabledAdmin, recoveryCodes };
}

export function verifyAdminMfaLogin(admin, code) {
  if (typeof code !== "string" || code.length > 64) return { verified: false };

  if (/^\d{6}$/.test(code) && admin.totp_secret_encrypted) {
    const secret = decryptSecret(admin.totp_secret_encrypted);
    const step = verifyTotpCode(secret, code, admin.last_totp_step);
    if (step !== null && consumeAdminTotpStep(admin.id, step)) {
      return { verified: true, usedRecoveryCode: false };
    }
  }

  const normalizedCode = code.toLowerCase().replace(/[\s-]/g, "");
  if (!/^[a-f0-9]{20}$/.test(normalizedCode)) return { verified: false };
  const consumed = consumeAdminRecoveryCode(admin, hashRecoveryCode(normalizedCode));
  return { verified: consumed, usedRecoveryCode: consumed };
}

export function getAdminMfaSetup(adminId) {
  return beginAdminMfaSetup(adminId);
}

export function normalizeRecoveryCodeForDisplay(code) {
  return code.match(/.{1,4}/g).join("-");
}
