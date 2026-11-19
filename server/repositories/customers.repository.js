import { timingSafeEqual } from "node:crypto";
import database from "../db/database.js";

export function saveCustomerLoginCode(email, codeHash, requestedAt, expiresAt, cooldownStartedAt) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("DELETE FROM customer_sessions WHERE expires_at <= ?").run(requestedAt);
    database.prepare("DELETE FROM customer_login_codes WHERE expires_at <= ?").run(requestedAt);
    const previousCode = database.prepare(`
      SELECT requested_at
      FROM customer_login_codes
      WHERE email = ?
    `).get(email);

    if (
      previousCode &&
      Date.parse(previousCode.requested_at) > Date.parse(cooldownStartedAt)
    ) {
      database.exec("COMMIT");
      return false;
    }

    database.prepare(`
      INSERT INTO customer_login_codes (email, code_hash, attempts, expires_at, requested_at)
      VALUES (?, ?, 0, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        code_hash = excluded.code_hash,
        attempts = 0,
        expires_at = excluded.expires_at,
        requested_at = excluded.requested_at
    `).run(email, codeHash, expiresAt, requestedAt);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function removeCustomerLoginCode(email, codeHash) {
  database.prepare(`
    DELETE FROM customer_login_codes
    WHERE email = ? AND code_hash = ?
  `).run(email, codeHash);
}

export function verifyCustomerLoginCode({
  email,
  candidateHash,
  now,
  customerId,
  sessionTokenHash,
  sessionExpiresAt,
}) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const loginCode = database.prepare(`
      SELECT code_hash, attempts, expires_at
      FROM customer_login_codes
      WHERE email = ?
    `).get(email);

    if (!loginCode || Date.parse(loginCode.expires_at) <= Date.parse(now)) {
      database.prepare("DELETE FROM customer_login_codes WHERE email = ?").run(email);
      database.exec("COMMIT");
      return false;
    }
    if (loginCode.attempts >= 5) {
      database.exec("COMMIT");
      return false;
    }

    const storedHash = Buffer.from(loginCode.code_hash, "hex");
    const providedHash = Buffer.from(candidateHash, "hex");
    const codeMatches = storedHash.length === providedHash.length &&
      timingSafeEqual(storedHash, providedHash);

    if (!codeMatches) {
      const attempts = loginCode.attempts + 1;
      database.prepare(`
        UPDATE customer_login_codes
        SET attempts = ?
        WHERE email = ?
      `).run(attempts, email);
      database.exec("COMMIT");
      return false;
    }

    database.prepare("DELETE FROM customer_login_codes WHERE email = ?").run(email);
    database.prepare(`
      INSERT INTO customer_accounts (id, email, email_verified_at, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET email_verified_at = excluded.email_verified_at
    `).run(customerId, email, now, now);
    const customer = database.prepare(`
      SELECT id, game_nickname
      FROM customer_accounts
      WHERE email = ?
    `).get(email);
    database.prepare(`
      INSERT INTO customer_sessions (token_hash, customer_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(sessionTokenHash, customer.id, sessionExpiresAt, now);
    database.exec("COMMIT");
    return { id: customer.id, email, gameNickname: customer.game_nickname };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function selectCustomerBySession(tokenHash, now) {
  return database.prepare(`
    SELECT customer_accounts.id, customer_accounts.email, customer_accounts.game_nickname
    FROM customer_sessions
    JOIN customer_accounts ON customer_accounts.id = customer_sessions.customer_id
    WHERE customer_sessions.token_hash = ? AND customer_sessions.expires_at > ?
  `).get(tokenHash, now);
}

export function updateCustomerGameNickname(customerId, gameNickname) {
  return database.prepare(`
    UPDATE customer_accounts
    SET game_nickname = ?
    WHERE id = ?
  `).run(gameNickname, customerId).changes;
}

export function deleteCustomerSession(tokenHash) {
  database.prepare("DELETE FROM customer_sessions WHERE token_hash = ?").run(tokenHash);
}

export function selectCustomerOrders(email, { page, limit }) {
  const total = database.prepare(`
    SELECT COUNT(*) AS total
    FROM orders
    WHERE lower(trim(customer_email)) = ?
  `).get(email).total;
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const orders = database.prepare(`
    SELECT order_record.id, order_record.payment_method, order_record.status,
      order_record.total_amount, order_record.currency, order_record.created_at,
      order_record.updated_at,
      (SELECT notification.delivery_status
        FROM order_status_notifications AS notification
        WHERE notification.order_id = order_record.id
        ORDER BY notification.id DESC LIMIT 1) AS notification_status,
      (SELECT notification.sent_at
        FROM order_status_notifications AS notification
        WHERE notification.order_id = order_record.id
        ORDER BY notification.id DESC LIMIT 1) AS notification_sent_at
    FROM orders AS order_record
    WHERE lower(trim(order_record.customer_email)) = ?
    ORDER BY order_record.created_at DESC, order_record.id DESC
    LIMIT ? OFFSET ?
  `).all(email, limit, (currentPage - 1) * limit);

  if (orders.length === 0) {
    return {
      data: [],
      pagination: { page: currentPage, limit, total, totalPages },
    };
  }

  const orderIds = orders.map((order) => order.id);
  const placeholders = orderIds.map(() => "?").join(", ");
  const items = database.prepare(`
    SELECT order_id, name, category, quantity, unit_price_cop, unit_price_platinum
    FROM order_items
    WHERE order_id IN (${placeholders})
    ORDER BY id
  `).all(...orderIds);
  const history = database.prepare(`
    SELECT order_id, status, changed_at
    FROM order_status_history
    WHERE order_id IN (${placeholders})
    ORDER BY changed_at, id
  `).all(...orderIds);
  const itemsByOrder = new Map();
  const historyByOrder = new Map();

  for (const item of items) {
    const orderItems = itemsByOrder.get(item.order_id) ?? [];
    orderItems.push({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unitPriceCop: item.unit_price_cop,
      unitPricePlatinum: item.unit_price_platinum,
    });
    itemsByOrder.set(item.order_id, orderItems);
  }

  for (const entry of history) {
    const orderHistory = historyByOrder.get(entry.order_id) ?? [];
    orderHistory.push({ status: entry.status, changedAt: entry.changed_at });
    historyByOrder.set(entry.order_id, orderHistory);
  }

  return {
    data: orders.map((order) => ({
      id: order.id,
      paymentMethod: order.payment_method,
      status: order.status,
      totalAmount: order.total_amount,
      currency: order.currency,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      notification: order.notification_status
        ? { status: order.notification_status, sentAt: order.notification_sent_at }
        : null,
      items: itemsByOrder.get(order.id) ?? [],
      history: historyByOrder.get(order.id) ?? [],
    })),
    pagination: { page: currentPage, limit, total, totalPages },
  };
}
