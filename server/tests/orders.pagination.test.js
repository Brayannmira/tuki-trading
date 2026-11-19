import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const testDirectory = mkdtempSync(join(tmpdir(), "tuki-pagination-test-"));
const sessionSecret = "pagination-test-secret-that-is-long-enough";
process.env.ADMIN_USERNAME = "pagination-test-admin";
process.env.ADMIN_PASSWORD = "pagination-test-password";
process.env.SESSION_SECRET = sessionSecret;
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.DATABASE_PATH = join(testDirectory, "orders.sqlite");

const [
  { createApp },
  { default: database },
  {
    insertOrder,
    updateOrderStatus: saveOrderStatus,
    deleteOrder: removeOrderRecord,
  },
] = await Promise.all([
  import("../app.js"),
  import("../db/database.js"),
  import("../repositories/orders.repository.js"),
]);

const statuses = ["Pendiente", "En proceso", "Completado", "Cancelado"];
let server;
let baseUrl;
let createdOrder;
let pricedOrder;
let sessionCookie;
let currentAdminPassword = process.env.ADMIN_PASSWORD;

function adminCookie() {
  const payload = Buffer.from(
    JSON.stringify({ expiresAt: Date.now() + 60_000, version: 0 }),
  ).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `tuki_admin_session=${payload}.${signature}`;
}

async function requestOrders(query = "", authenticated = true) {
  const headers = authenticated ? { cookie: sessionCookie ?? adminCookie() } : {};
  return fetch(`${baseUrl}/api/admin/orders${query}`, { headers });
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

before(async () => {
  for (let index = 0; index < 23; index += 1) {
    const id = `pagination-test-${String(index).padStart(2, "0")}`;
    const createdAt = new Date(Date.now() - index * 1000).toISOString();
    insertOrder({
      id,
      trackingTokenHash: `test-hash-${index}`,
      realName: `Test Order ${index}`,
      gameNickname: `Player${index}`,
      paymentMethod: "Platino",
      items: [{ name: `Item ${index}`, category: "Test" }],
      createdAt,
    });

    const status = statuses[index % statuses.length];
    if (status !== "Pendiente") {
      database.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
    }
  }

  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  database.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

test("admin orders require an authenticated session", async () => {
  const response = await requestOrders("", false);
  assert.equal(response.status, 401);
});

test("returns the default first page and global dashboard summary", async () => {
  const response = await requestOrders();
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.data.length, 10);
  assert.equal(result.data[0].id, "pagination-test-00");
  assert.deepEqual(result.pagination, {
    page: 1,
    limit: 10,
    total: 23,
    totalPages: 3,
  });
  assert.equal(result.summary.active, 12);
  assert.equal(result.summary.completed, 6);
  assert.equal(result.summary.cancelled, 5);
  assert.ok(Number.isInteger(result.summary.thisMonth));
  assert.ok(result.summary.thisMonth <= 23);
  assert.ok(Array.isArray(result.summary.chartData));
});

test("returns the requested page with its orders and items", async () => {
  const response = await requestOrders("?page=2&limit=5");
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.data.length, 5);
  assert.equal(result.data[0].id, "pagination-test-05");
  assert.equal(result.data[0].items[0].name, "Item 5");
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 5,
    total: 23,
    totalPages: 5,
  });
});

test("filters by status and clamps a page beyond the last page", async () => {
  const filteredResponse = await requestOrders("?status=Completado");
  const filtered = await filteredResponse.json();
  assert.equal(filteredResponse.status, 200);
  assert.equal(filtered.pagination.total, 6);
  assert.ok(filtered.data.every((order) => order.status === "Completado"));

  const lastPageResponse = await requestOrders("?page=999&limit=10");
  const lastPage = await lastPageResponse.json();
  assert.equal(lastPageResponse.status, 200);
  assert.equal(lastPage.pagination.page, 3);
  assert.equal(lastPage.data.length, 3);
});

test("rejects invalid pagination and status parameters", async () => {
  for (const query of ["?page=0", "?limit=51", "?status=Unknown"]) {
    const response = await requestOrders(query);
    assert.equal(response.status, 400, query);
  }
});

test("creates an order and returns a one-time tracking token", async () => {
  const response = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      realName: "  Test Customer ",
      gameNickname: "TestPlayer",
      paymentMethod: "Platino",
      items: [{ name: "Test Weapon", category: "Melee" }],
    }),
  });
  createdOrder = await response.json();

  assert.equal(response.status, 201);
  assert.match(createdOrder.id, /^[\da-f-]{36}$/i);
  assert.equal(createdOrder.status, "Pendiente");
  assert.equal(createdOrder.trackingToken.length, 43);
  assert.equal(
    database.prepare("SELECT real_name FROM orders WHERE id = ?").get(createdOrder.id).real_name,
    "Test Customer",
  );
  assert.notEqual(
    database.prepare("SELECT tracking_token_hash FROM orders WHERE id = ?")
      .get(createdOrder.id).tracking_token_hash,
    createdOrder.trackingToken,
  );
});

test("rejects invalid order data without inserting an order", async () => {
  const response = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      realName: "",
      gameNickname: "TestPlayer",
      paymentMethod: "Invalid",
      items: [],
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Revisa los datos y artículos de la solicitud.",
  });
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM orders WHERE real_name = ''").get().total,
    0,
  );
});

test("looks up the created order only with its valid tracking token", async () => {
  const success = await request(`/api/orders/${createdOrder.id}/status`, {
    headers: { authorization: `Bearer ${createdOrder.trackingToken}` },
  });
  const result = await success.json();

  assert.equal(success.status, 200);
  assert.equal(result.id, createdOrder.id);
  assert.equal(result.status, "Pendiente");
  assert.equal("realName" in result, false);

  const invalidToken = await request(`/api/orders/${createdOrder.id}/status`, {
    headers: { authorization: "Bearer invalid-tracking-token" },
  });
  assert.equal(invalidToken.status, 404);

  const unknownOrder = await request(`/api/orders/unknown-order/status`, {
    headers: { authorization: `Bearer ${createdOrder.trackingToken}` },
  });
  assert.equal(unknownOrder.status, 404);
});

test("admin login issues a session cookie and rejects incorrect credentials", async () => {
  const invalidLogin = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ username: "wrong", password: "wrong" }),
  });
  assert.equal(invalidLogin.status, 401);

  const login = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME,
      password: currentAdminPassword,
    }),
  });
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { authenticated: true });

  const setCookie = login.headers.get("set-cookie");
  assert.ok(setCookie);
  sessionCookie = setCookie.split(";")[0];
  assert.match(sessionCookie, /^tuki_admin_session=/);

  const session = await request("/api/admin/session", {
    headers: { cookie: sessionCookie },
  });
  assert.deepEqual(await session.json(), { authenticated: true });

  const unauthorizedList = await requestOrders("", false);
  assert.equal(unauthorizedList.status, 401);
});

test("admin manages catalog prices and an order snapshots totals and status history", async () => {
  const productId = "warframes:Test Prime";
  const updateProduct = await request(
    `/api/admin/catalog/${encodeURIComponent(productId)}`,
    {
      method: "PATCH",
      headers: {
        cookie: sessionCookie,
        origin: process.env.APP_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: productId,
        name: "Test Prime",
        category: "Warframes",
        priceCop: 12000,
        pricePlatinum: 20,
        stockQuantity: 3,
        availability: "Disponible",
      }),
    },
  );
  assert.equal(updateProduct.status, 200);

  const publicCatalog = await request("/api/catalog");
  const products = await publicCatalog.json();
  const savedProduct = products.find((product) => product.id === productId);
  assert.equal(publicCatalog.status, 200);
  assert.equal(savedProduct.priceCop, 12000);
  assert.equal(savedProduct.stockQuantity, 3);

  const createPricedOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      realName: "Catalog Customer",
      gameNickname: "CatalogPlayer",
      paymentMethod: "Dinero (COP)",
      items: [{
        id: productId,
        name: "Test Prime",
        category: "Warframes",
        quantity: 2,
      }],
    }),
  });
  pricedOrder = await createPricedOrder.json();
  assert.equal(createPricedOrder.status, 201);
  assert.equal(pricedOrder.totalAmount, 24000);
  assert.equal(pricedOrder.currency, "COP");

  const orderItem = database.prepare(`
    SELECT product_id, quantity, unit_price_cop
    FROM order_items
    WHERE order_id = ?
  `).get(pricedOrder.id);
  assert.deepEqual({ ...orderItem }, {
    product_id: productId,
    quantity: 2,
    unit_price_cop: 12000,
  });

  for (const status of ["En proceso", "Completado"]) {
    const updateStatus = await request(`/api/admin/orders/${pricedOrder.id}/status`, {
      method: "PATCH",
      headers: {
        cookie: sessionCookie,
        origin: process.env.APP_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status }),
    });
    assert.equal(updateStatus.status, 200);
  }

  const trackedOrder = await request(`/api/orders/${pricedOrder.id}/status`, {
    headers: { authorization: `Bearer ${pricedOrder.trackingToken}` },
  });
  const trackingDetails = await trackedOrder.json();
  assert.deepEqual(trackingDetails.history.map((entry) => entry.status), [
    "Pendiente",
    "En proceso",
    "Completado",
  ]);
  assert.equal(savedProduct.popularity, 0);

  const updatedProducts = await (await request("/api/catalog")).json();
  const completedProduct = updatedProducts.find((product) => product.id === productId);
  assert.equal(completedProduct.popularity, 2);
  assert.equal(completedProduct.stockQuantity, 1);

  const overStockOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      realName: "Catalog Customer",
      gameNickname: "CatalogPlayer",
      paymentMethod: "Dinero (COP)",
      items: [{
        id: productId,
        name: "Test Prime",
        category: "Warframes",
        quantity: 4,
      }],
    }),
  });
  assert.equal(overStockOrder.status, 409);

  const reopenOrder = await request(`/api/admin/orders/${pricedOrder.id}/status`, {
    method: "PATCH",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "Cancelado" }),
  });
  assert.equal(reopenOrder.status, 200);
  const restoredProducts = await (await request("/api/catalog")).json();
  const restoredProduct = restoredProducts.find((product) => product.id === productId);
  assert.equal(restoredProduct.stockQuantity, 3);
  assert.equal(restoredProduct.popularity, 0);

  const pendingOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      realName: "Catalog Customer",
      gameNickname: "CatalogPlayer",
      paymentMethod: "Dinero (COP)",
      items: [{
        id: productId,
        name: "Test Prime",
        category: "Warframes",
        quantity: 2,
      }],
    }),
  });
  const pendingOrderDetails = await pendingOrder.json();
  assert.equal(pendingOrder.status, 201);

  const reduceStock = await request(
    `/api/admin/catalog/${encodeURIComponent(productId)}`,
    {
      method: "PATCH",
      headers: {
        cookie: sessionCookie,
        origin: process.env.APP_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: productId,
        name: "Test Prime",
        category: "Warframes",
        priceCop: 12000,
        pricePlatinum: 20,
        stockQuantity: 1,
        availability: "Disponible",
      }),
    },
  );
  assert.equal(reduceStock.status, 200);

  const cannotComplete = await request(
    `/api/admin/orders/${pendingOrderDetails.id}/status`,
    {
      method: "PATCH",
      headers: {
        cookie: sessionCookie,
        origin: process.env.APP_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "Completado" }),
    },
  );
  assert.equal(cannotComplete.status, 409);
  assert.equal(database.prepare("SELECT status FROM orders WHERE id = ?")
    .get(pendingOrderDetails.id).status, "Pendiente");
  assert.equal(database.prepare("SELECT stock_quantity FROM catalog_products WHERE id = ?")
    .get(productId).stock_quantity, 1);
});

test("admin imports catalog prices and rejects invalid import batches", async () => {
  const imported = await request("/api/admin/catalog/import", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      products: [{
        id: "mele:Imported Item",
        name: "Imported Item",
        category: "Armas Melé",
        priceCop: 5000,
        pricePlatinum: null,
        stockQuantity: 2,
        availability: "Disponible",
      }],
    }),
  });
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).importedCount, 1);
  assert.equal(
    database.prepare("SELECT price_cop FROM catalog_products WHERE id = ?")
      .get("mele:Imported Item").price_cop,
    5000,
  );

  const invalid = await request("/api/admin/catalog/import", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      products: [{
        id: "mele:Invalid Item",
        name: "Invalid Item",
        category: "Armas Melé",
        priceCop: -1,
        pricePlatinum: null,
        stockQuantity: 0,
        availability: "Desconocido",
      }],
    }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM catalog_products WHERE id = ?")
      .get("mele:Invalid Item").total,
    0,
  );
});

test("admin can download a consistent SQLite database backup", async () => {
  const response = await request("/api/admin/backup", {
    method: "POST",
    headers: { cookie: sessionCookie, origin: process.env.APP_ORIGIN },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /tuki-trading-.*\.sqlite/);
  const file = Buffer.from(await response.arrayBuffer());
  assert.equal(file.subarray(0, 15).toString(), "SQLite format 3");
});

test("admin audit route requires a session and lists recorded actions", async () => {
  const unauthorized = await request("/api/admin/audit");
  assert.equal(unauthorized.status, 401);

  const response = await request("/api/admin/audit?limit=10", {
    headers: { cookie: sessionCookie },
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(Array.isArray(result.data));
  assert.ok(result.pagination.total >= 1);
  assert.ok(result.data.every((entry) =>
    typeof entry.actor === "string" &&
    typeof entry.action === "string" &&
    typeof entry.entity_id === "string"
  ));
});

test("stock is reserved atomically and deleting a completed order restores it", async () => {
  const productId = "warframes:Concurrency Test";
  const updateProduct = await request(
    `/api/admin/catalog/${encodeURIComponent(productId)}`,
    {
      method: "PATCH",
      headers: {
        cookie: sessionCookie,
        origin: process.env.APP_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: productId,
        name: "Concurrency Test",
        category: "Warframes",
        priceCop: 1000,
        pricePlatinum: 1,
        stockQuantity: 1,
        availability: "Disponible",
      }),
    },
  );
  assert.equal(updateProduct.status, 200);

  const createRequests = Array.from({ length: 2 }, () =>
    request("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        realName: "Concurrent Customer",
        gameNickname: "ConcurrentPlayer",
        paymentMethod: "Dinero (COP)",
        items: [{ id: productId, name: "Concurrency Test", category: "Warframes", quantity: 1 }],
      }),
    }),
  );
  const responses = await Promise.all(createRequests);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);

  const successfulOrder = await (
    await Promise.all(responses.map((response) =>
      response.status === 201 ? response.json() : null,
    ))
  ).find((result) => result !== null);
  const complete = await request(`/api/admin/orders/${successfulOrder.id}/status`, {
    method: "PATCH",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "Completado" }),
  });
  assert.equal(complete.status, 200);
  assert.equal(
    database.prepare("SELECT stock_quantity FROM catalog_products WHERE id = ?")
      .get(productId).stock_quantity,
    0,
  );

  const remove = await request(`/api/admin/orders/${successfulOrder.id}`, {
    method: "DELETE",
    headers: { cookie: sessionCookie, origin: process.env.APP_ORIGIN },
  });
  assert.equal(remove.status, 204);
  assert.equal(
    database.prepare("SELECT stock_quantity FROM catalog_products WHERE id = ?")
      .get(productId).stock_quantity,
    1,
  );
});

test("admin can update and delete an order; invalid and missing updates fail", async () => {
  const invalidUpdate = await request(`/api/admin/orders/${createdOrder.id}/status`, {
    method: "PATCH",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "Unknown" }),
  });
  assert.equal(invalidUpdate.status, 400);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM admin_audit_log WHERE entity_id = ?")
      .get(createdOrder.id).total,
    0,
  );

  const missingUpdate = await request("/api/admin/orders/unknown-order/status", {
    method: "PATCH",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "En proceso" }),
  });
  assert.equal(missingUpdate.status, 404);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM admin_audit_log WHERE entity_id = ?")
      .get("unknown-order").total,
    0,
  );

  const update = await request(`/api/admin/orders/${createdOrder.id}/status`, {
    method: "PATCH",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "En proceso" }),
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).status, "En proceso");

  const statusAudit = database.prepare(`
    SELECT actor, action, entity_id, details, created_at
    FROM admin_audit_log
    WHERE entity_id = ?
  `).get(createdOrder.id);
  assert.equal(statusAudit.actor, process.env.ADMIN_USERNAME);
  assert.equal(statusAudit.action, "order.status_changed");
  assert.equal(statusAudit.entity_id, createdOrder.id);
  assert.deepEqual(JSON.parse(statusAudit.details), {
    from: "Pendiente",
    to: "En proceso",
  });
  assert.ok(Number.isFinite(Date.parse(statusAudit.created_at)));
  assert.equal(statusAudit.details.includes(createdOrder.trackingToken), false);

  const unchangedStatus = await request(`/api/admin/orders/${createdOrder.id}/status`, {
    method: "PATCH",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "En proceso" }),
  });
  assert.equal(unchangedStatus.status, 200);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM admin_audit_log WHERE entity_id = ?")
      .get(createdOrder.id).total,
    1,
  );

  database.exec(`
    CREATE TRIGGER reject_audit_insert
    BEFORE INSERT ON admin_audit_log
    BEGIN
      SELECT RAISE(ABORT, 'audit unavailable');
    END;
  `);
  try {
    assert.throws(
      () => saveOrderStatus(
        createdOrder.id,
        "Completado",
        new Date().toISOString(),
        process.env.ADMIN_USERNAME,
      ),
      /audit unavailable/,
    );
    assert.throws(
      () => removeOrderRecord(createdOrder.id, process.env.ADMIN_USERNAME),
      /audit unavailable/,
    );
  } finally {
    database.exec("DROP TRIGGER reject_audit_insert");
  }
  assert.equal(
    database.prepare("SELECT status FROM orders WHERE id = ?").get(createdOrder.id).status,
    "En proceso",
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM orders WHERE id = ?")
      .get(createdOrder.id).total,
    1,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM admin_audit_log WHERE entity_id = ?")
      .get(createdOrder.id).total,
    1,
  );

  const deleteOrder = await request(`/api/admin/orders/${createdOrder.id}`, {
    method: "DELETE",
    headers: { cookie: sessionCookie, origin: process.env.APP_ORIGIN },
  });
  assert.equal(deleteOrder.status, 204);
  assert.equal(await deleteOrder.text(), "");
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM orders WHERE id = ?")
      .get(createdOrder.id).total,
    0,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM order_items WHERE order_id = ?")
      .get(createdOrder.id).total,
    0,
  );
  const deleteAudit = database.prepare(`
    SELECT actor, action, entity_id, details, created_at
    FROM admin_audit_log
    WHERE entity_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(createdOrder.id);
  assert.equal(deleteAudit.actor, process.env.ADMIN_USERNAME);
  assert.equal(deleteAudit.action, "order.deleted");
  assert.equal(deleteAudit.entity_id, createdOrder.id);
  assert.equal(deleteAudit.details, null);
  assert.ok(Number.isFinite(Date.parse(deleteAudit.created_at)));

  const missingDelete = await request(`/api/admin/orders/${createdOrder.id}`, {
    method: "DELETE",
    headers: { cookie: sessionCookie, origin: process.env.APP_ORIGIN },
  });
  assert.equal(missingDelete.status, 404);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM admin_audit_log WHERE entity_id = ?")
      .get(createdOrder.id).total,
    2,
  );
});

test("payment orders use the server snapshot and malformed JSON is rejected", async () => {
  const malformed = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, "El cuerpo de la solicitud no es JSON válido.");

  const updateProduct = await request(
    "/api/admin/catalog/unpriced-test",
    {
      method: "PATCH",
      headers: {
        cookie: sessionCookie,
        origin: process.env.APP_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "unpriced-test",
        name: "Unpriced Test",
        category: "Test",
        priceCop: null,
        pricePlatinum: null,
        stockQuantity: null,
        availability: "Por confirmar",
      }),
    },
  );
  assert.equal(updateProduct.status, 200);

  const pendingQuotation = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      realName: "Quotation Customer",
      gameNickname: "QuotationPlayer",
      paymentMethod: "Dinero (COP)",
      items: [{
        id: "unpriced-test",
        name: "Unpriced Test",
        category: "Test",
        quantity: 1,
      }],
    }),
  });
  assert.equal(pendingQuotation.status, 201);
  const quotation = await pendingQuotation.json();
  assert.equal(quotation.totalAmount, null);
  assert.equal(quotation.currency, "COP");
});

test("sqlite write failures roll back order creation and status changes", () => {
  const beforeCount = database.prepare("SELECT COUNT(*) AS total FROM orders").get().total;
  database.exec(`
    CREATE TRIGGER reject_test_order_insert
    BEFORE INSERT ON orders
    BEGIN
      SELECT RAISE(ABORT, 'sqlite unavailable');
    END;
  `);
  try {
    assert.throws(
      () => insertOrder({
        id: "sqlite-failure-order",
        trackingTokenHash: "sqlite-failure-hash",
        realName: "SQLite Failure",
        gameNickname: "SQLitePlayer",
        paymentMethod: "Platino",
        items: [{ name: "Test Item", category: "Test", quantity: 1 }],
        createdAt: new Date().toISOString(),
      }),
      /sqlite unavailable/,
    );
  } finally {
    database.exec("DROP TRIGGER reject_test_order_insert");
  }
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM orders").get().total, beforeCount);
});

test("rejects state-changing requests from a different origin", async () => {
  const login = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME,
      password: currentAdminPassword,
    }),
  });
  assert.equal(login.status, 403);

  const passwordChange = await request("/api/admin/password", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin: "https://attacker.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({ currentPassword: currentAdminPassword, newPassword: "new-password-secure" }),
  });
  assert.equal(passwordChange.status, 403);
});

test("changes admin password, persists its hash, and invalidates old sessions", async () => {
  const wrongCurrent = await request("/api/admin/password", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ currentPassword: "wrong-current-password", newPassword: "new-password-secure" }),
  });
  assert.equal(wrongCurrent.status, 400);

  const shortPassword = await request("/api/admin/password", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ currentPassword: currentAdminPassword, newPassword: "short" }),
  });
  assert.equal(shortPassword.status, 400);

  const previousSession = sessionCookie;
  const newPassword = "new-password-secure";
  const change = await request("/api/admin/password", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ currentPassword: currentAdminPassword, newPassword }),
  });
  assert.equal(change.status, 200);
  assert.deepEqual(await change.json(), { passwordChanged: true });

  const oldSession = await request("/api/admin/session", {
    headers: { cookie: previousSession },
  });
  assert.deepEqual(await oldSession.json(), { authenticated: false });

  const oldPasswordLogin = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME,
      password: currentAdminPassword,
    }),
  });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordLogin = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME, password: newPassword }),
  });
  assert.equal(newPasswordLogin.status, 200);
  sessionCookie = newPasswordLogin.headers.get("set-cookie").split(";")[0];
  currentAdminPassword = newPassword;
});

test("logout clears the session and prevents further admin access", async () => {
  const logout = await request("/api/admin/logout", {
    method: "POST",
    headers: { cookie: sessionCookie, origin: process.env.APP_ORIGIN },
  });
  assert.equal(logout.status, 204);

  const session = await request("/api/admin/session");
  assert.deepEqual(await session.json(), { authenticated: false });

  const orders = await requestOrders("", false);
  assert.equal(orders.status, 401);
});
