import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { DatabaseSync } from "node:sqlite";

const testDirectory = mkdtempSync(join(tmpdir(), "tuki-admin-migration-"));
const databasePath = join(testDirectory, "orders.sqlite");
const legacyDatabase = new DatabaseSync(databasePath);
const legacyPasswordHash = "legacy-password-hash";
process.env.ADMIN_USERNAME = "migration-owner";
process.env.ADMIN_PASSWORD = "migration-initial-password";
process.env.SESSION_SECRET = "migration-test-session-secret-with-at-least-32-chars";
process.env.DATABASE_PATH = databasePath;

legacyDatabase.exec(`
  CREATE TABLE admin_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    session_version INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  INSERT INTO admin_credentials (id, password_hash, updated_at)
    VALUES (1, '${legacyPasswordHash}', '2025-01-01T00:00:00.000Z');
  CREATE TABLE admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('order.status_changed', 'order.deleted')),
    entity_id TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX admin_audit_log_entity_created
    ON admin_audit_log (entity_id, created_at DESC);
  INSERT INTO admin_audit_log (actor, action, entity_id, details, created_at)
    VALUES ('legacy-admin', 'order.status_changed', 'order-1', '{"from":"Pendiente"}', '2025-01-02T00:00:00.000Z');
  CREATE TABLE catalog_products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price_cop INTEGER,
    price_platinum INTEGER,
    stock_quantity INTEGER,
    availability TEXT NOT NULL DEFAULT 'Por confirmar',
    updated_at TEXT NOT NULL
  );
  INSERT INTO catalog_products (id, name, category, updated_at)
    VALUES ('legacy:catalog-item', 'Legacy item', 'Warframes', '2025-01-01T00:00:00.000Z');
`);
legacyDatabase.close();

const [
  { default: database },
  ,
  { createTotpCode, verifyTotpCode },
] = await Promise.all([
  import("../db/database.js"),
  import("../services/admin.service.js"),
  import("../services/adminMfa.service.js"),
]);

after(() => {
  database.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

test("migrates the single administrator and preserves/extends existing audit history", () => {
  const owner = database.prepare(`
    SELECT username, role, password_hash, mfa_enabled
    FROM admin_users
  `).get();
  assert.deepEqual({ ...owner }, {
    username: "migration-owner",
    role: "owner",
    password_hash: legacyPasswordHash,
    mfa_enabled: 0,
  });

  const oldEntry = database.prepare(`
    SELECT actor, action, entity_id, details
    FROM admin_audit_log
  `).get();
  assert.deepEqual({ ...oldEntry }, {
    actor: "legacy-admin",
    action: "order.status_changed",
    entity_id: "order-1",
    details: '{"from":"Pendiente"}',
  });

  const migratedCatalogProduct = database.prepare(`
    SELECT version FROM catalog_products WHERE id = 'legacy:catalog-item'
  `).get();
  assert.equal(migratedCatalogProduct.version, 1);

  assert.doesNotThrow(() => database.prepare(`
    INSERT INTO admin_audit_log (actor, action, entity_id, created_at)
    VALUES ('migration-owner', 'catalog.product_updated', 'product-1', '2025-01-03T00:00:00.000Z')
  `).run());
});

test("generates RFC-compatible six-digit TOTP codes and rejects replayed time steps", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(createTotpCode(secret, 1), "287082");
  assert.equal(verifyTotpCode(secret, "287082", 0, 59_000), 1);
  assert.equal(verifyTotpCode(secret, "287082", 1, 59_000), null);
});
