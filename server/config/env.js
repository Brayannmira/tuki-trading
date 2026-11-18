import "dotenv/config";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET } = process.env;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !SESSION_SECRET) {
  throw new Error("Configura ADMIN_USERNAME, ADMIN_PASSWORD y SESSION_SECRET en .env.");
}

if (ADMIN_PASSWORD.length < 12 || SESSION_SECRET.length < 32) {
  throw new Error("ADMIN_PASSWORD debe tener 12 caracteres y SESSION_SECRET 32 caracteres como mínimo.");
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
  appOrigin: new URL(process.env.APP_ORIGIN || "http://localhost:5173").origin,
  port: Number(process.env.PORT || 3001),
  isProduction: process.env.NODE_ENV === "production",
  databasePath: process.env.DATABASE_PATH
    ? resolve(process.env.DATABASE_PATH)
    : defaultDatabasePath,
};
