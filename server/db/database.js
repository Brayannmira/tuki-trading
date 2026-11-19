import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config/env.js";

mkdirSync(dirname(config.databasePath), { recursive: true });

const database = new DatabaseSync(config.databasePath);

database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    tracking_token_hash TEXT,
    real_name TEXT NOT NULL,
    game_nickname TEXT NOT NULL,
    customer_email TEXT,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendiente'
      CHECK (status IN ('Pendiente', 'En proceso', 'Completado', 'Cancelado')),
    total_amount INTEGER CHECK (total_amount IS NULL OR total_amount >= 0),
    currency TEXT CHECK (currency IS NULL OR currency IN ('COP', 'Platino')),
    idempotency_key_hash TEXT,
    idempotency_request_hash TEXT,
    tracking_token_encrypted TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
    unit_price_cop INTEGER CHECK (unit_price_cop IS NULL OR unit_price_cop >= 0),
    unit_price_platinum INTEGER CHECK (unit_price_platinum IS NULL OR unit_price_platinum >= 0)
  );
  CREATE TABLE IF NOT EXISTS catalog_products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price_cop INTEGER CHECK (price_cop IS NULL OR price_cop >= 0),
    price_platinum INTEGER CHECK (price_platinum IS NULL OR price_platinum >= 0),
    stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
    availability TEXT NOT NULL DEFAULT 'Por confirmar'
      CHECK (availability IN ('Disponible', 'En Bóveda', 'Oferta Especial', 'Agotado', 'Por confirmar')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL
      CHECK (status IN ('Pendiente', 'En proceso', 'Completado', 'Cancelado')),
    changed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_status_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('En proceso', 'Completado')),
    recipient_email TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (delivery_status IN ('pending', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT
  );
  CREATE TABLE IF NOT EXISTS admin_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    session_version INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'orders', 'catalog', 'viewer')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1)),
    totp_secret_encrypted TEXT,
    last_totp_step INTEGER NOT NULL DEFAULT -1,
    must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
    session_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_recovery_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS admin_recovery_codes_admin
    ON admin_recovery_codes (admin_id);
  CREATE TABLE IF NOT EXISTS customer_accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    game_nickname TEXT,
    email_verified_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS customer_login_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    expires_at TEXT NOT NULL,
    requested_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS customer_sessions (
    token_hash TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN (
      'order.status_changed',
      'order.deleted',
      'catalog.product_updated',
      'admin.login',
      'admin.mfa_enrolled',
      'admin.mfa_recovery_used',
      'admin.password_changed',
      'admin.user_created',
      'admin.user_role_changed',
      'admin.user_mfa_reset',
      'admin.user_deactivated'
    )),
    entity_id TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS admin_audit_log_entity_created
    ON admin_audit_log (entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS order_status_history_order_created
      ON order_status_history (order_id, changed_at);
`);

const catalogColumns = database.prepare("PRAGMA table_info(catalog_products)").all();
if (!catalogColumns.some((column) => column.name === "version")) {
  database.exec(`
    ALTER TABLE catalog_products
    ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
  `);
}

const auditTableSchema = database.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'admin_audit_log'
`).get().sql;
if (!auditTableSchema.includes("catalog.product_updated")) {
  database.exec(`
    BEGIN IMMEDIATE;
    DROP INDEX IF EXISTS admin_audit_log_entity_created;
    ALTER TABLE admin_audit_log RENAME TO admin_audit_log_previous;
    CREATE TABLE admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN (
        'order.status_changed',
        'order.deleted',
        'catalog.product_updated',
        'admin.login',
        'admin.mfa_enrolled',
        'admin.mfa_recovery_used',
        'admin.password_changed',
        'admin.user_created',
        'admin.user_role_changed',
        'admin.user_mfa_reset',
        'admin.user_deactivated'
      )),
      entity_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO admin_audit_log (id, actor, action, entity_id, details, created_at)
      SELECT id, actor, action, entity_id, details, created_at
      FROM admin_audit_log_previous;
    DROP TABLE admin_audit_log_previous;
    CREATE INDEX admin_audit_log_entity_created
      ON admin_audit_log (entity_id, created_at DESC);
    COMMIT;
  `);
}

const orderColumns = database.prepare("PRAGMA table_info(orders)").all();
if (!orderColumns.some((column) => column.name === "tracking_token_hash")) {
  database.exec("ALTER TABLE orders ADD COLUMN tracking_token_hash TEXT");
}
  if (!orderColumns.some((column) => column.name === "total_amount")) {
    database.exec("ALTER TABLE orders ADD COLUMN total_amount INTEGER");
  }
  if (!orderColumns.some((column) => column.name === "currency")) {
    database.exec("ALTER TABLE orders ADD COLUMN currency TEXT");
  }
  if (!orderColumns.some((column) => column.name === "customer_email")) {
    database.exec("ALTER TABLE orders ADD COLUMN customer_email TEXT");
  }
  if (!orderColumns.some((column) => column.name === "idempotency_key_hash")) {
    database.exec("ALTER TABLE orders ADD COLUMN idempotency_key_hash TEXT");
  }
  if (!orderColumns.some((column) => column.name === "idempotency_request_hash")) {
    database.exec("ALTER TABLE orders ADD COLUMN idempotency_request_hash TEXT");
  }
  if (!orderColumns.some((column) => column.name === "tracking_token_encrypted")) {
    database.exec("ALTER TABLE orders ADD COLUMN tracking_token_encrypted TEXT");
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_hash
      ON orders (idempotency_key_hash)
      WHERE idempotency_key_hash IS NOT NULL
  `);

  const orderItemColumns = database.prepare("PRAGMA table_info(order_items)").all();
  const orderItemMigrations = [
    ["product_id", "TEXT"],
    ["quantity", "INTEGER NOT NULL DEFAULT 1"],
    ["unit_price_cop", "INTEGER"],
    ["unit_price_platinum", "INTEGER"],
  ];
  for (const [columnName, columnDefinition] of orderItemMigrations) {
    if (!orderItemColumns.some((column) => column.name === columnName)) {
      database.exec(`ALTER TABLE order_items ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  }
  database.exec("CREATE INDEX IF NOT EXISTS order_items_product_id ON order_items (product_id)");
  const customerAccountColumns = database.prepare("PRAGMA table_info(customer_accounts)").all();
  if (!customerAccountColumns.some((column) => column.name === "game_nickname")) {
    database.exec("ALTER TABLE customer_accounts ADD COLUMN game_nickname TEXT");
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS order_status_notifications_order_created
      ON order_status_notifications (order_id, created_at DESC)
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS orders_customer_email_created
      ON orders (lower(trim(customer_email)), created_at DESC)
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS customer_sessions_expiration
      ON customer_sessions (expires_at)
  `);
  database.exec(`
    INSERT INTO order_status_history (order_id, status, changed_at)
    SELECT orders.id, orders.status, orders.updated_at
    FROM orders
    WHERE NOT EXISTS (
      SELECT 1
      FROM order_status_history
      WHERE order_status_history.order_id = orders.id
    )
  `);

  const platinumPackages = [
    ["platino:100 platinos", "100 platinos", 12000],
    ["platino:250 platinos", "250 platinos", 22000],
    ["platino:600 platinos", "600 platinos", 50000],
  ];
  const insertPackage = database.prepare(`
    INSERT OR IGNORE INTO catalog_products (
      id, name, category, price_cop, price_platinum, stock_quantity, availability, updated_at
    ) VALUES (?, ?, 'Platino', ?, NULL, NULL, 'Disponible', ?)
  `);
  for (const [id, name, priceCop] of platinumPackages) {
    insertPackage.run(id, name, priceCop, new Date().toISOString());
  }

export default database;
