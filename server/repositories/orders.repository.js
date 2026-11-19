import database from "../db/database.js";

export function insertOrder(order) {
  const insertOrderStatement = database.prepare(`
    INSERT INTO orders (
      id, tracking_token_hash, real_name, game_nickname, payment_method,
      total_amount, currency, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItemStatement = database.prepare(
    `INSERT INTO order_items (
      order_id, product_id, name, category, quantity, unit_price_cop, unit_price_platinum
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  database.exec("BEGIN");
  try {
    const quantitiesByProduct = new Map();
    for (const item of order.items) {
      if (!item.productId) continue;
      quantitiesByProduct.set(
        item.productId,
        (quantitiesByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    for (const [productId, quantity] of quantitiesByProduct) {
      const product = selectCatalogProduct(productId);
      if (
        product &&
        (product.availability === "Agotado" ||
          (product.stock_quantity !== null &&
            quantity + database.prepare(`
              SELECT COALESCE(SUM(order_item.quantity), 0) AS quantity
              FROM order_items AS order_item
              JOIN orders AS order_record ON order_record.id = order_item.order_id
              WHERE order_item.product_id = ?
                AND order_record.status IN ('Pendiente', 'En proceso')
            `).get(productId).quantity > product.stock_quantity))
      ) {
        const error = new Error(`${product.name} no tiene existencias suficientes.`);
        error.statusCode = 409;
        throw error;
      }
    }

    insertOrderStatement.run(
      order.id,
      order.trackingTokenHash,
      order.realName,
      order.gameNickname,
      order.paymentMethod,
      order.totalAmount ?? null,
      order.currency ?? null,
      order.createdAt,
      order.createdAt,
    );
    for (const item of order.items) {
      insertItemStatement.run(
        order.id,
        item.productId ?? null,
        item.name,
        item.category,
        item.quantity ?? 1,
        item.unitPriceCop ?? null,
        item.unitPricePlatinum ?? null,
      );
    }
    database.prepare(`
      INSERT INTO order_status_history (order_id, status, changed_at)
      VALUES (?, 'Pendiente', ?)
    `).run(order.id, order.createdAt);
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
    SELECT id, real_name, game_nickname, payment_method, status, total_amount, currency,
      created_at, updated_at
    FROM orders
    ${clause}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...parameters, limit, offset);

  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const placeholders = orderIds.map(() => "?").join(", ");
  const items = database.prepare(`
    SELECT order_id, product_id, name, category, quantity, unit_price_cop, unit_price_platinum
    FROM order_items
    WHERE order_id IN (${placeholders})
    ORDER BY id
  `).all(...orderIds);
  const itemsByOrder = new Map();

  for (const item of items) {
    const orderItems = itemsByOrder.get(item.order_id) ?? [];
    orderItems.push({
      productId: item.product_id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unitPriceCop: item.unit_price_cop,
      unitPricePlatinum: item.unit_price_platinum,
    });
    itemsByOrder.set(item.order_id, orderItems);
  }

  return orders.map((order) => ({
    id: order.id,
    realName: order.real_name,
    gameNickname: order.game_nickname,
    paymentMethod: order.payment_method,
    status: order.status,
    totalAmount: order.total_amount,
    currency: order.currency,
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

export function selectOrderStatusHistory(id) {
  return database.prepare(`
    SELECT status, changed_at
    FROM order_status_history
    WHERE order_id = ?
    ORDER BY changed_at, id
  `).all(id);
}

export function selectCatalogProduct(id) {
  return database.prepare(`
    SELECT id, name, category, price_cop, price_platinum, stock_quantity, availability
    FROM catalog_products
    WHERE id = ?
  `).get(id);
}

export function selectCatalogProducts() {
  return database.prepare(`
    SELECT
      product.id,
      product.name,
      product.category,
      product.price_cop,
      product.price_platinum,
      product.stock_quantity,
      product.availability,
      product.updated_at,
      COALESCE((
        SELECT SUM(order_item.quantity)
        FROM order_items AS order_item
        JOIN orders AS order_record ON order_record.id = order_item.order_id
        WHERE order_item.product_id = product.id
          AND order_record.status = 'Completado'
      ), 0) AS popularity
    FROM catalog_products AS product
    ORDER BY product.category, product.name
  `).all();
}

export function saveCatalogProduct(product) {
  database.prepare(`
    INSERT INTO catalog_products (
      id, name, category, price_cop, price_platinum, stock_quantity, availability, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      price_cop = excluded.price_cop,
      price_platinum = excluded.price_platinum,
      stock_quantity = excluded.stock_quantity,
      availability = excluded.availability,
      updated_at = excluded.updated_at
  `).run(
    product.id,
    product.name,
    product.category,
    product.priceCop,
    product.pricePlatinum,
    product.stockQuantity,
    product.availability,
    product.updatedAt,
  );
}

export function saveCatalogProducts(products) {
  database.exec("BEGIN");
  try {
    for (const product of products) {
      saveCatalogProduct(product);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
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

    const completesOrder = order.status !== "Completado" && status === "Completado";
    const reopensCompletedOrder = order.status === "Completado" && status !== "Completado";
    if (completesOrder || reopensCompletedOrder) {
      const orderItems = database.prepare(`
        SELECT product_id, name, quantity
        FROM order_items
        WHERE order_id = ? AND product_id IS NOT NULL
      `).all(id);
      const quantitiesByProduct = new Map();
      for (const item of orderItems) {
        const existing = quantitiesByProduct.get(item.product_id);
        quantitiesByProduct.set(item.product_id, {
          productId: item.product_id,
          name: existing?.name ?? item.name,
          quantity: (existing?.quantity ?? 0) + item.quantity,
        });
      }
      const items = [...quantitiesByProduct.values()];

      if (completesOrder) {
        for (const item of items) {
          const product = selectCatalogProduct(item.productId);
          if (product?.stock_quantity !== null &&
            product?.stock_quantity !== undefined &&
            product.stock_quantity < item.quantity) {
            database.exec("ROLLBACK");
            return {
              changes: 0,
              stockError: `${item.name} no tiene existencias suficientes para completar el pedido.`,
            };
          }
        }
      }

      for (const item of items) {
        const product = selectCatalogProduct(item.productId);
        if (product?.stock_quantity === null || product?.stock_quantity === undefined) continue;

        const nextQuantity = product.stock_quantity +
          (completesOrder ? -item.quantity : item.quantity);
        const nextAvailability = completesOrder && nextQuantity === 0
          ? "Agotado"
          : reopensCompletedOrder && product.availability === "Agotado"
            ? "Disponible"
            : product.availability;
        database.prepare(`
          UPDATE catalog_products
          SET stock_quantity = ?, availability = ?, updated_at = ?
          WHERE id = ?
        `).run(nextQuantity, nextAvailability, updatedAt, item.productId);
      }
    }

    const changes = database
      .prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, updatedAt, id).changes;

    if (order.status !== status) {
      database.prepare(`
        INSERT INTO order_status_history (order_id, status, changed_at)
        VALUES (?, ?, ?)
      `).run(id, status, updatedAt);
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
    const order = database.prepare("SELECT status FROM orders WHERE id = ?").get(id);
    if (!order) {
      database.exec("COMMIT");
      return 0;
    }

    if (order.status === "Completado") {
      const orderItems = database.prepare(`
        SELECT product_id, name, quantity
        FROM order_items
        WHERE order_id = ? AND product_id IS NOT NULL
      `).all(id);
      const quantitiesByProduct = new Map();
      for (const item of orderItems) {
        quantitiesByProduct.set(
          item.product_id,
          (quantitiesByProduct.get(item.product_id) ?? 0) + item.quantity,
        );
      }

      for (const [productId, quantity] of quantitiesByProduct) {
        const product = selectCatalogProduct(productId);
        if (product?.stock_quantity === null || product?.stock_quantity === undefined) continue;

        const nextQuantity = product.stock_quantity + quantity;
        const nextAvailability =
          product.availability === "Agotado" ? "Disponible" : product.availability;
        database.prepare(`
          UPDATE catalog_products
          SET stock_quantity = ?, availability = ?, updated_at = ?
          WHERE id = ?
        `).run(nextQuantity, nextAvailability, new Date().toISOString(), productId);
      }
    }

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

export function selectAdminAuditLog({ limit = 50, offset = 0 } = {}) {
  return database.prepare(`
    SELECT id, actor, action, entity_id, details, created_at
    FROM admin_audit_log
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

export function countAdminAuditLog() {
  return database.prepare("SELECT COUNT(*) AS total FROM admin_audit_log").get().total;
}
