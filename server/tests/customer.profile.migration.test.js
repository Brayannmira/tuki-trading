import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const testDirectory = mkdtempSync(join(tmpdir(), "tuki-customer-profile-migration-"));
const databasePath = join(testDirectory, "orders.sqlite");
process.env.ADMIN_USERNAME = "customer-migration-admin";
process.env.ADMIN_PASSWORD = "customer-migration-password";
process.env.SESSION_SECRET = "customer-migration-session-secret-long-enough";
process.env.DATABASE_PATH = databasePath;
process.env.NODE_ENV = "test";

const legacyDatabase = new DatabaseSync(databasePath);
legacyDatabase.exec(`
  CREATE TABLE customer_accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    email_verified_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);
legacyDatabase.prepare(`
  INSERT INTO customer_accounts (id, email, email_verified_at, created_at)
  VALUES (?, ?, ?, ?)
`).run("legacy-customer", "legacy@example.com", "2026-01-01", "2026-01-01");
legacyDatabase.close();

const { default: database } = await import("../db/database.js");

test("adds the saved game nickname to existing customer accounts", () => {
  const columns = database.prepare("PRAGMA table_info(customer_accounts)").all();
  assert.ok(columns.some((column) => column.name === "game_nickname"));
  assert.equal(
    database.prepare(`
      SELECT game_nickname
      FROM customer_accounts
      WHERE id = ?
    `).get("legacy-customer").game_nickname,
    null,
  );
});

after(() => {
  database.close();
  rmSync(testDirectory, { recursive: true, force: true });
});
