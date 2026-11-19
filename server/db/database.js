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
  CREATE TABLE IF NOT EXISTS customer_accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
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
    action TEXT NOT NULL CHECK (action IN ('order.status_changed', 'order.deleted')),
    entity_id TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS admin_audit_log_entity_created
    ON admin_audit_log (entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS order_status_history_order_created
      ON order_status_history (order_id, changed_at);
`);

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
