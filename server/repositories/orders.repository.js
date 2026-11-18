import database from "../db/database.js";

export function insertOrder(order) {
  const insertOrderStatement = database.prepare(`
    INSERT INTO orders (
      id, tracking_token_hash, real_name, game_nickname, payment_method, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItemStatement = database.prepare(
    "INSERT INTO order_items (order_id, name, category) VALUES (?, ?, ?)",
  );

  database.exec("BEGIN");
  try {
    insertOrderStatement.run(
      order.id,
      order.trackingTokenHash,
      order.realName,
      order.gameNickname,
      order.paymentMethod,
      order.createdAt,
      order.createdAt,
    );
    for (const item of order.items) {
      insertItemStatement.run(order.id, item.name, item.category);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function orderStatusFilter(status) {
  return status === "Todos"
    ? { clause: "", parameters: [] }
    : { clause: "WHERE status = ?", parameters: [status] };
}

export function countOrders(status) {
  const { clause, parameters } = orderStatusFilter(status);
  return database.prepare(`SELECT COUNT(*) AS total FROM orders ${clause}`).get(...parameters).total;
}

export function selectOrdersPage({ limit, offset, status }) {
  const { clause, parameters } = orderStatusFilter(status);
  const orders = database.prepare(`
    SELECT id, real_name, game_nickname, payment_method, status, created_at, updated_at
    FROM orders
    ${clause}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...parameters, limit, offset);

  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const placeholders = orderIds.map(() => "?").join(", ");
  const items = database.prepare(`
    SELECT order_id, name, category
    FROM order_items
    WHERE order_id IN (${placeholders})
    ORDER BY id
  `).all(...orderIds);
  const itemsByOrder = new Map();

  for (const item of items) {
    const orderItems = itemsByOrder.get(item.order_id) ?? [];
    orderItems.push({ name: item.name, category: item.category });
    itemsByOrder.set(item.order_id, orderItems);
  }

  return orders.map((order) => ({
    id: order.id,
    realName: order.real_name,
    gameNickname: order.game_nickname,
    paymentMethod: order.payment_method,
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: itemsByOrder.get(order.id) ?? [],
  }));
}

export function selectOrderSummary() {
  const totals = database.prepare(`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN strftime('%Y-%m', created_at, 'localtime') =
            strftime('%Y-%m', 'now', 'localtime')
          THEN 1 ELSE 0
        END
      ), 0) AS thisMonth,
      COALESCE(SUM(
        CASE WHEN status IN ('Pendiente', 'En proceso') THEN 1 ELSE 0 END
      ), 0) AS active,
      COALESCE(SUM(CASE WHEN status = 'Completado' THEN 1 ELSE 0 END), 0) AS completed,
      COALESCE(SUM(CASE WHEN status = 'Cancelado' THEN 1 ELSE 0 END), 0) AS cancelled
    FROM orders
  `).get();
  const chartData = database.prepare(`
    SELECT date(created_at, 'localtime') AS dateKey, COUNT(*) AS pedidos
    FROM orders
    WHERE date(created_at, 'localtime')
      BETWEEN date('now', 'localtime', '-6 days') AND date('now', 'localtime')
    GROUP BY dateKey
    ORDER BY dateKey
  `).all();

  return { ...totals, chartData };
}

export function selectOrderStatus(id, trackingTokenHash) {
  return database
    .prepare(`
      SELECT id, status, created_at, updated_at
      FROM orders
      WHERE id = ? AND tracking_token_hash = ?
    `)
    .get(id, trackingTokenHash);
}

export function updateOrderStatus(id, status, updatedAt, actor) {
  database.exec("BEGIN");
  try {
    const order = database
      .prepare("SELECT status FROM orders WHERE id = ?")
      .get(id);

    if (!order) {
      database.exec("COMMIT");
      return { changes: 0 };
    }

    const changes = database
      .prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, updatedAt, id).changes;

    if (order.status !== status) {
      database.prepare(`
        INSERT INTO admin_audit_log (actor, action, entity_id, details, created_at)
        VALUES (?, 'order.status_changed', ?, ?, ?)
      `).run(
        actor,
        id,
        JSON.stringify({ from: order.status, to: status }),
        updatedAt,
      );
    }
    database.exec("COMMIT");
    return { changes };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function deleteOrder(id, actor) {
  database.exec("BEGIN");
  try {
    const result = database
      .prepare("DELETE FROM orders WHERE id = ?")
      .run(id);

    if (result.changes > 0) {
      database.prepare(`
        INSERT INTO admin_audit_log (actor, action, entity_id, details, created_at)
        VALUES (?, 'order.deleted', ?, NULL, ?)
      `).run(actor, id, new Date().toISOString());
    }

    database.exec("COMMIT");
    return result.changes;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
