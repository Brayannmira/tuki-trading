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

export function selectOrders() {
  const orders = database
    .prepare("SELECT * FROM orders ORDER BY created_at DESC")
    .all();
  const items = database
    .prepare("SELECT order_id, name, category FROM order_items ORDER BY id")
    .all();
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

export function selectOrderStatus(id, trackingTokenHash) {
  return database
    .prepare(`
      SELECT id, status, created_at, updated_at
      FROM orders
      WHERE id = ? AND tracking_token_hash = ?
    `)
    .get(id, trackingTokenHash);
}

export function updateOrderStatus(id, status, updatedAt) {
  return database
    .prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, updatedAt, id).changes;
}

export function deleteOrder(id) {
  return database
    .prepare("DELETE FROM orders WHERE id = ?")
    .run(id).changes;
}
