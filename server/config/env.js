import "dotenv/config";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET } = process.env;
const adminMfaEncryptionKey =
  process.env.ADMIN_MFA_ENCRYPTION_KEY?.trim() || SESSION_SECRET;
const smtpHost = process.env.SMTP_HOST?.trim() ?? "";
const smtpPortValue = process.env.SMTP_PORT?.trim() ?? "";
const smtpSecureValue = process.env.SMTP_SECURE?.trim() ?? "";
const smtpUser = process.env.SMTP_USER?.trim() ?? "";
const smtpPassword = process.env.SMTP_PASSWORD ?? "";
const smtpFrom = process.env.SMTP_FROM?.trim() ?? "";
const hasSmtpConfiguration = [
  smtpHost,
  smtpPortValue,
  smtpSecureValue,
  smtpUser,
  smtpPassword,
  smtpFrom,
].some(Boolean);

if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !SESSION_SECRET) {
  throw new Error("Configura ADMIN_USERNAME, ADMIN_PASSWORD y SESSION_SECRET en .env.");
}

if (
  ADMIN_PASSWORD.length < 12 ||
  SESSION_SECRET.length < 32 ||
  adminMfaEncryptionKey.length < 32
) {
  throw new Error("ADMIN_PASSWORD debe tener 12 caracteres y SESSION_SECRET y ADMIN_MFA_ENCRYPTION_KEY 32 caracteres como mínimo.");
}

if (hasSmtpConfiguration &&
  (!smtpHost || !smtpPortValue || !smtpUser || !smtpPassword || !smtpFrom)) {
  throw new Error("Completa SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD y SMTP_FROM.");
}

const smtpPort = smtpPortValue ? Number(smtpPortValue) : null;
if (smtpPortValue && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
  throw new Error("SMTP_PORT debe ser un puerto válido entre 1 y 65535.");
}
if (smtpSecureValue && !["true", "false"].includes(smtpSecureValue.toLowerCase())) {
  throw new Error("SMTP_SECURE debe ser true o false.");
}

const defaultDatabasePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "orders.sqlite",
);

export const config = {
  adminUsername: ADMIN_USERNAME,
  adminPassword: ADMIN_PASSWORD,
  sessionSecret: SESSION_SECRET,
  adminMfaEncryptionKey,
  appOrigin: new URL(process.env.APP_ORIGIN || "http://localhost:5173").origin,
  port: Number(process.env.PORT || 3001),
  isProduction: process.env.NODE_ENV === "production",
  smtp: hasSmtpConfiguration
    ? {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecureValue.toLowerCase() === "true",
      user: smtpUser,
      password: smtpPassword,
      from: smtpFrom,
    }
    : null,
  databasePath: process.env.DATABASE_PATH
    ? resolve(process.env.DATABASE_PATH)
    : defaultDatabasePath,
};
