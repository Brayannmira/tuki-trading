import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, mock, test } from "node:test";

const testDirectory = mkdtempSync(join(tmpdir(), "tuki-pagination-test-"));
const sessionSecret = "pagination-test-secret-that-is-long-enough";
process.env.ADMIN_USERNAME = "pagination-test-admin";
process.env.ADMIN_PASSWORD = "pagination-test-password";
process.env.SESSION_SECRET = sessionSecret;
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.DATABASE_PATH = join(testDirectory, "orders.sqlite");
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "smtp-test-user";
process.env.SMTP_PASSWORD = "smtp-test-password";
process.env.SMTP_FROM = "Tuki Trading <orders@example.com>";

const sentEmails = [];
let failNextEmail = false;
const nodemailer = await import("nodemailer");
mock.method(nodemailer.default, "createTransport", () => ({
  sendMail: async (message) => {
    if (failNextEmail) {
      failNextEmail = false;
      throw new Error("SMTP temporary failure");
    }
    sentEmails.push(message);
    return { accepted: [message.to], rejected: [] };
  },
}));

const [
  { createApp },
  { default: database },
  {
    insertOrder,
    updateOrderStatus: saveOrderStatus,
    deleteOrder: removeOrderRecord,
  },
  { isValidOrder },
  { createAdminSessionToken },
  { beginAdminMfaSetup, completeAdminMfaSetup, createTotpCode },
] = await Promise.all([
  import("../app.js"),
  import("../db/database.js"),
  import("../repositories/orders.repository.js"),
  import("../services/orders.service.js"),
  import("../services/session.service.js"),
  import("../services/adminMfa.service.js"),
]);

const statuses = ["Pendiente", "En proceso", "Completado", "Cancelado"];
let server;
let baseUrl;
let createdOrder;
let pricedOrder;
let sessionCookie;
let currentAdminPassword = process.env.ADMIN_PASSWORD;
let recoveryCodes = [];
let testTotpSecret;

function adminCookie() {
  const admin = database.prepare(`
    SELECT * FROM admin_users WHERE username = ?
  `).get(process.env.ADMIN_USERNAME);
  return `tuki_admin_session=${createAdminSessionToken(admin)}`;
}

async function requestOrders(query = "", authenticated = true) {
  const headers = authenticated ? { cookie: sessionCookie ?? adminCookie() } : {};
  return fetch(`${baseUrl}/api/admin/orders${query}`, { headers });
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

before(async () => {
  const initialAdmin = database.prepare(`
    SELECT id FROM admin_users WHERE username = ?
  `).get(process.env.ADMIN_USERNAME);
  const setup = beginAdminMfaSetup(initialAdmin.id);
  testTotpSecret = setup.secret;
  const enrollment = completeAdminMfaSetup(
    initialAdmin.id,
    createTotpCode(testTotpSecret, Math.floor(Date.now() / 30_000)),
  );
  assert.ok(enrollment.admin);
  recoveryCodes = enrollment.recoveryCodes;

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

test("adds a request ID to responses and structured access logs", async () => {
  const entries = [];
  const originalLog = console.log;
  console.log = (entry) => entries.push(JSON.parse(entry));
  try {
    const response = await request("/api/health");
    const requestId = response.headers.get("x-request-id");
    await response.text();

    assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.ok(entries.some((entry) =>
      entry.event === "http.request.completed" &&
      entry.requestId === requestId &&
      entry.method === "GET" &&
      entry.path === "/api/health" &&
      entry.statusCode === 200
    ));
  } finally {
    console.log = originalLog;
  }
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
  const idempotencyKey = randomUUID();
  const orderData = {
    realName: "  Test Customer ",
    gameNickname: "TestPlayer",
    email: "customer@example.com",
    paymentMethod: "Platino",
    items: [{ name: "Test Weapon", category: "Melee" }],
  };
  const options = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(orderData),
  };
  const [response, retryResponse] = await Promise.all([
    request("/api/orders", options),
    request("/api/orders", options),
  ]);
  const [firstResult, retry] = await Promise.all([
    response.json(),
    retryResponse.json(),
  ]);
  createdOrder = firstResult;

  assert.equal(response.status, 201);
  assert.equal(retryResponse.status, 201);
  assert.match(createdOrder.id, /^[\da-f-]{36}$/i);
  assert.equal(createdOrder.status, "Pendiente");
  assert.equal(createdOrder.trackingToken.length, 43);
  assert.equal(retry.id, createdOrder.id);
  assert.equal(retry.trackingToken, createdOrder.trackingToken);
  assert.equal(
    database.prepare("SELECT real_name FROM orders WHERE id = ?").get(createdOrder.id).real_name,
    "Test Customer",
  );
  assert.equal(
    database.prepare("SELECT customer_email FROM orders WHERE id = ?")
      .get(createdOrder.id).customer_email,
    "customer@example.com",
  );
  assert.notEqual(
    database.prepare("SELECT tracking_token_hash FROM orders WHERE id = ?")
      .get(createdOrder.id).tracking_token_hash,
    createdOrder.trackingToken,
  );

  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM orders WHERE id = ?")
      .get(createdOrder.id).total,
    1,
  );
  const storedToken = database.prepare(
    "SELECT tracking_token_encrypted FROM orders WHERE id = ?",
  ).get(createdOrder.id).tracking_token_encrypted;
  assert.ok(storedToken);
  assert.notEqual(storedToken, createdOrder.trackingToken);

  const changedPayloadResponse = await request("/api/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ ...orderData, gameNickname: "DifferentPlayer" }),
  });
  assert.equal(changedPayloadResponse.status, 409);
  assert.equal(
    (await changedPayloadResponse.json()).error,
    "La clave de reintento ya se usó con una solicitud diferente.",
  );
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM orders WHERE id = ?")
    .get(createdOrder.id).total, 1);
});

test("rejects invalid order data without inserting an order", async () => {
  const validOrder = {
    realName: "Test Customer",
    gameNickname: "TestPlayer",
    email: "customer@example.com",
    paymentMethod: "Platino",
    items: [{ name: "Test Weapon", category: "Melee" }],
  };
  assert.equal(isValidOrder({ ...validOrder, email: undefined }), false);
  assert.equal(isValidOrder({ ...validOrder, email: "not-an-email" }), false);

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

  const passwordLogin = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME,
      password: currentAdminPassword,
    }),
  });
  assert.equal(passwordLogin.status, 200);
  assert.deepEqual(await passwordLogin.json(), { twoFactorRequired: true });

  const login = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME,
      password: currentAdminPassword,
      code: recoveryCodes.shift(),
    }),
  });
  assert.equal(login.status, 200);
  const loginResult = await login.json();
  assert.equal(loginResult.authenticated, true);
  assert.equal(loginResult.role, "owner");

  const setCookie = login.headers.get("set-cookie");
  assert.ok(setCookie);
  sessionCookie = setCookie.split(";")[0];
  assert.match(sessionCookie, /^tuki_admin_session=/);

  const session = await request("/api/admin/session", {
    headers: { cookie: sessionCookie },
  });
  const sessionResult = await session.json();
  assert.equal(sessionResult.authenticated, true);
  assert.equal(sessionResult.username, process.env.ADMIN_USERNAME);
  assert.equal(sessionResult.role, "owner");

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
        expectedVersion: null,
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
      email: "catalog@example.com",
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
    if (status === "Completado") failNextEmail = true;
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
    const statusResult = await updateStatus.json();
    if (status === "En proceso") {
      assert.equal(statusResult.notification.status, "sent");
      assert.equal(sentEmails[0].to, "catalog@example.com");
      assert.match(sentEmails[0].subject, /En proceso|pedido/);
      assert.equal(
        database.prepare("SELECT delivery_status FROM order_status_notifications WHERE id = ?")
          .get(statusResult.notification.id).delivery_status,
        "sent",
      );
      const retryNotification = await request(
        `/api/admin/notifications/${statusResult.notification.id}/retry`,
        {
          method: "POST",
          headers: {
            cookie: sessionCookie,
            origin: process.env.APP_ORIGIN,
          },
        },
      );
      assert.equal(retryNotification.status, 200);
      assert.equal((await retryNotification.json()).status, "sent");
      assert.equal(sentEmails.length, 1);
    } else {
      assert.equal(statusResult.notification.status, "failed");
      const retryNotification = await request(
        `/api/admin/notifications/${statusResult.notification.id}/retry`,
        {
          method: "POST",
          headers: {
            cookie: sessionCookie,
            origin: process.env.APP_ORIGIN,
          },
        },
      );
      assert.equal(retryNotification.status, 200);
      assert.equal((await retryNotification.json()).status, "sent");
      assert.equal(sentEmails.length, 2);
    }
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
      email: "catalog@example.com",
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
  const inventoryAudit = database.prepare(`
    SELECT actor, details
    FROM admin_audit_log
    WHERE action = 'catalog.product_updated' AND entity_id = ?
  `).all(productId);
  assert.ok(inventoryAudit.some((entry) => {
    const details = JSON.parse(entry.details);
    return entry.actor === process.env.ADMIN_USERNAME &&
      details.source === "order_completed" &&
      details.changes.some((change) =>
        change.field === "stockQuantity" && change.before === 3 && change.after === 1
      );
  }));
  assert.ok(inventoryAudit.some((entry) => {
    const details = JSON.parse(entry.details);
    return details.source === "order_reopened" &&
      details.changes.some((change) =>
        change.field === "stockQuantity" && change.before === 1 && change.after === 3
      );
  }));

  const pendingOrder = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      realName: "Catalog Customer",
      gameNickname: "CatalogPlayer",
      email: "catalog@example.com",
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
        expectedVersion: completedProduct.version,
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

test("rejects stale admin catalog versions with 409", async () => {
  const productId = "warframes:Versioned Test";
  const createProduct = await request(`/api/admin/catalog/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: productId,
      name: "Versioned Test",
      category: "Warframes",
      priceCop: 1000,
      pricePlatinum: 1,
      stockQuantity: 4,
      availability: "Disponible",
      expectedVersion: null,
    }),
  });
  assert.equal(createProduct.status, 200);
  const createdProduct = await createProduct.json();
  assert.equal(createdProduct.version, 1);

  const updateProduct = (priceCop) => request(
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
        name: "Versioned Test",
        category: "Warframes",
        priceCop,
        pricePlatinum: 1,
        stockQuantity: 4,
        availability: "Disponible",
        expectedVersion: createdProduct.version,
      }),
    },
  );
  const responses = await Promise.all([updateProduct(1500), updateProduct(2000)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);

  const conflict = responses.find((response) => response.status === 409);
  assert.match((await conflict.json()).error, /Otro administrador actualizó este artículo/);
  const savedProduct = database.prepare(`
    SELECT price_cop, version FROM catalog_products WHERE id = ?
  `).get(productId);
  assert.equal(savedProduct.version, 2);
  assert.ok([1500, 2000].includes(savedProduct.price_cop));
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
        expectedVersion: null,
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
  const originalUpdatedAt = database.prepare(
    "SELECT updated_at FROM catalog_products WHERE id = ?",
  ).get("mele:Imported Item").updated_at;
  const originalVersion = database.prepare(
    "SELECT version FROM catalog_products WHERE id = ?",
  ).get("mele:Imported Item").version;
  const staleImport = await request("/api/admin/catalog/import", {
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
        priceCop: 6000,
        pricePlatinum: null,
        stockQuantity: 2,
        availability: "Disponible",
        expectedVersion: null,
      }],
    }),
  });
  assert.equal(staleImport.status, 409);
  assert.equal(database.prepare(
    "SELECT price_cop FROM catalog_products WHERE id = ?",
  ).get("mele:Imported Item").price_cop, 5000);
  const originalAuditCount = database.prepare(`
    SELECT COUNT(*) AS total FROM admin_audit_log
    WHERE action = 'catalog.product_updated' AND entity_id = ?
  `).get("mele:Imported Item").total;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const unchangedImport = await request("/api/admin/catalog/import", {
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
        expectedVersion: originalVersion,
      }],
    }),
  });
  assert.equal(unchangedImport.status, 200);
  assert.equal(database.prepare(
    "SELECT updated_at FROM catalog_products WHERE id = ?",
  ).get("mele:Imported Item").updated_at, originalUpdatedAt);
  assert.equal(database.prepare(
    "SELECT version FROM catalog_products WHERE id = ?",
  ).get("mele:Imported Item").version, originalVersion);
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS total FROM admin_audit_log
    WHERE action = 'catalog.product_updated' AND entity_id = ?
  `).get("mele:Imported Item").total, originalAuditCount);

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
        expectedVersion: null,
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

test("admin catalog import accepts a large atomic batch and rolls it back on database failure", async () => {
  const products = Array.from({ length: 201 }, (_, index) => ({
    id: index === 200 ? "atomic-import:fail" : `atomic-import:${index}`,
    name: `Atomic import ${index} ${"x".repeat(90)}`,
    category: "Armas Melé",
    priceCop: 5000,
    pricePlatinum: null,
    stockQuantity: 2,
    availability: "Disponible",
    expectedVersion: null,
  }));
  const body = JSON.stringify({ products });
  assert.ok(Buffer.byteLength(body) > 25 * 1024);

  database.exec(`
    CREATE TRIGGER fail_catalog_import_test
    BEFORE INSERT ON catalog_products
    WHEN NEW.id = 'atomic-import:fail'
    BEGIN
      SELECT RAISE(ABORT, 'catalog import test failure');
    END
  `);
  try {
    const failedImport = await request("/api/admin/catalog/import", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        origin: process.env.APP_ORIGIN,
        "content-type": "application/json",
      },
      body,
    });
    assert.equal(failedImport.status, 500);
  } finally {
    database.exec("DROP TRIGGER fail_catalog_import_test");
  }
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS total FROM catalog_products WHERE id LIKE 'atomic-import:%'
  `).get().total, 0);

  const imported = await request("/api/admin/catalog/import", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body,
  });
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).importedCount, products.length);
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS total FROM catalog_products WHERE id LIKE 'atomic-import:%'
  `).get().total, products.length);

  const oversizedImport = await request("/api/admin/catalog/import", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ products: [], padding: "x".repeat(1024 * 1024) }),
  });
  assert.equal(oversizedImport.status, 413);
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
  const catalogAudit = await request("/api/admin/audit?limit=50&category=catalog", {
    headers: { cookie: sessionCookie },
  });
  assert.equal(catalogAudit.status, 200);
  const catalogResult = await catalogAudit.json();
  assert.ok(catalogResult.data.some((entry) => {
    if (entry.action !== "catalog.product_updated") return false;
    const details = JSON.parse(entry.details);
    return details.changes.some((change) => change.field === "priceCop") &&
      details.changes.some((change) => change.field === "stockQuantity");
  }));

  const productAudit = await request(
    `/api/admin/audit?limit=10&category=catalog&entityId=${encodeURIComponent("mele:Imported Item")}`,
    { headers: { cookie: sessionCookie } },
  );
  assert.equal(productAudit.status, 200);
  const productAuditResult = await productAudit.json();
  assert.ok(productAuditResult.data.length > 0);
  assert.ok(productAuditResult.data.every((entry) => entry.entity_id === "mele:Imported Item"));

  const invalidEntityId = await request(
    `/api/admin/audit?entityId=${"x".repeat(181)}`,
    { headers: { cookie: sessionCookie } },
  );
  assert.equal(invalidEntityId.status, 400);
});

test("admin users require TOTP, change their temporary password, and are limited by role", async () => {
  const initialPassword = "viewer-initial-password";
  const create = await request("/api/admin/users", {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: "audit-viewer",
      password: initialPassword,
      role: "viewer",
    }),
  });
  assert.equal(create.status, 201);
  const createdUser = (await create.json()).user;

  const initialLogin = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ username: "audit-viewer", password: initialPassword }),
  });
  assert.deepEqual(await initialLogin.json(), { mfaSetupRequired: true });
  const setupCookie = initialLogin.headers.get("set-cookie").split(";")[0];
  const setupResponse = await request("/api/admin/mfa/setup", {
    headers: { cookie: setupCookie },
  });
  const setup = await setupResponse.json();
  assert.equal(setupResponse.status, 200);
  assert.ok(setup.secret);
  assert.match(setup.otpauthUri, /^otpauth:\/\/totp\//);

  const enroll = await request("/api/admin/mfa/verify", {
    method: "POST",
    headers: {
      cookie: setupCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      code: createTotpCode(setup.secret, Math.floor(Date.now() / 30_000)),
    }),
  });
  assert.equal(enroll.status, 200);
  const enrollment = await enroll.json();
  assert.equal(enrollment.mustChangePassword, true);
  assert.equal(enrollment.recoveryCodes.length, 10);
  const forcedSessionCookie = enroll.headers.get("set-cookie").split(";")[0];

  const blockedUntilPasswordChanged = await request("/api/admin/orders", {
    headers: { cookie: forcedSessionCookie },
  });
  assert.equal(blockedUntilPasswordChanged.status, 403);

  const passwordChange = await request("/api/admin/password", {
    method: "POST",
    headers: {
      cookie: forcedSessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      currentPassword: initialPassword,
      newPassword: "viewer-new-secure-password",
    }),
  });
  assert.equal(passwordChange.status, 200);

  const secondFactorChallenge = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ username: "audit-viewer", password: "viewer-new-secure-password" }),
  });
  assert.deepEqual(await secondFactorChallenge.json(), { twoFactorRequired: true });
  const viewerLogin = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({
      username: "audit-viewer",
      password: "viewer-new-secure-password",
      code: enrollment.recoveryCodes[0],
    }),
  });
  assert.equal(viewerLogin.status, 200);
  const viewerSessionCookie = viewerLogin.headers.get("set-cookie").split(";")[0];

  const readableOrders = await request("/api/admin/orders", {
    headers: { cookie: viewerSessionCookie },
  });
  assert.equal(readableOrders.status, 200);
  const readableCatalog = await request("/api/admin/catalog", {
    headers: { cookie: viewerSessionCookie },
  });
  assert.equal(readableCatalog.status, 200);
  const forbiddenOrderChange = await request("/api/admin/orders/pagination-test-00/status", {
    method: "PATCH",
    headers: {
      cookie: viewerSessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "Cancelado" }),
  });
  assert.equal(forbiddenOrderChange.status, 403);
  const forbiddenCatalogChange = await request("/api/admin/catalog/warframes%3ATest%20Prime", {
    method: "PATCH",
    headers: {
      cookie: viewerSessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assert.equal(forbiddenCatalogChange.status, 403);
  const forbiddenUserList = await request("/api/admin/users", {
    headers: { cookie: viewerSessionCookie },
  });
  assert.equal(forbiddenUserList.status, 403);

  const roleChange = await request(`/api/admin/users/${createdUser.id}/role`, {
    method: "PATCH",
    headers: {
      cookie: sessionCookie,
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ role: "catalog" }),
  });
  assert.equal(roleChange.status, 200);
  const revokedSession = await request("/api/admin/session", {
    headers: { cookie: viewerSessionCookie },
  });
  assert.deepEqual(await revokedSession.json(), { authenticated: false });

  const resetMfa = await request(`/api/admin/users/${createdUser.id}/mfa-reset`, {
    method: "POST",
    headers: { cookie: sessionCookie, origin: process.env.APP_ORIGIN },
  });
  assert.equal(resetMfa.status, 200);
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
        expectedVersion: null,
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
        email: "concurrent@example.com",
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
        expectedVersion: null,
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
      email: "quotation@example.com",
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

  const passwordChallenge = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME, password: newPassword }),
  });
  assert.equal(passwordChallenge.status, 200);
  assert.deepEqual(await passwordChallenge.json(), { twoFactorRequired: true });

  const newPasswordLogin = await request("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME,
      password: newPassword,
      code: recoveryCodes.shift(),
    }),
  });
  assert.equal(newPasswordLogin.status, 200);
  assert.equal((await newPasswordLogin.json()).authenticated, true);
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
