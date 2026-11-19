import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, mock, test } from "node:test";

const testDirectory = mkdtempSync(join(tmpdir(), "tuki-customer-auth-test-"));
process.env.ADMIN_USERNAME = "customer-auth-test-admin";
process.env.ADMIN_PASSWORD = "customer-auth-test-password";
process.env.SESSION_SECRET = "customer-auth-test-session-secret-long-enough";
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = join(testDirectory, "orders.sqlite");
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "smtp-test-user";
process.env.SMTP_PASSWORD = "smtp-test-password";
process.env.SMTP_FROM = "Tuki Trading <orders@example.com>";

const sentEmails = [];
const nodemailer = await import("nodemailer");
mock.method(nodemailer.default, "createTransport", () => ({
  sendMail: async (message) => {
    sentEmails.push(message);
    return { accepted: [message.to], rejected: [] };
  },
}));

const [{ createApp }, { default: database }, { insertOrder }] = await Promise.all([
  import("../app.js"),
  import("../db/database.js"),
  import("../repositories/orders.repository.js"),
]);

let server;
let baseUrl;

function request(path, body, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? "POST",
    headers: {
      origin: process.env.APP_ORIGIN,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function extractCode(emailMessage) {
  const match = /código de acceso es: (\d{8})/i.exec(emailMessage.text);
  assert.ok(match, "the email contains an eight-digit one-time code");
  return match[1];
}

function insertTestOrder(id, customerEmail) {
  insertOrder({
    id,
    trackingTokenHash: `tracking-hash-${id}`,
    realName: `Customer ${id}`,
    gameNickname: `Player${id}`,
    customerEmail,
    paymentMethod: "Dinero (COP)",
    totalAmount: 12000,
    currency: "COP",
    items: [{ name: `Item ${id}`, category: "Test", quantity: 2 }],
    createdAt: new Date().toISOString(),
  });
}

before(async () => {
  insertTestOrder("owned-order", "Customer@Example.com");
  insertTestOrder("other-order", "other@example.com");
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

test("customer login verifies email and exposes only matching orders", async () => {
  const existingEmailResponse = await request(
    "/api/customer/auth/request-code",
    { email: "Customer@Example.com" },
  );
  const existingMessage = await existingEmailResponse.json();
  const unknownEmailResponse = await request(
    "/api/customer/auth/request-code",
    { email: "nobody@example.com" },
  );

  assert.equal(existingEmailResponse.status, 202);
  assert.equal(unknownEmailResponse.status, 202);
  assert.deepEqual(await unknownEmailResponse.json(), existingMessage);
  assert.equal(sentEmails.length, 2);
  assert.equal(sentEmails[0].to, "customer@example.com");
  assert.equal(JSON.stringify(existingMessage).includes(extractCode(sentEmails[0])), false);

  const throttledResponse = await request(
    "/api/customer/auth/request-code",
    { email: "customer@example.com" },
  );
  assert.equal(throttledResponse.status, 202);
  assert.deepEqual(await throttledResponse.json(), existingMessage);
  assert.equal(sentEmails.length, 2);

  const verification = await request("/api/customer/auth/verify-code", {
    email: "CUSTOMER@example.com",
    code: extractCode(sentEmails[0]),
  });
  const verificationResult = await verification.json();
  assert.equal(verification.status, 200);
  assert.deepEqual(verificationResult, {
    authenticated: true,
    email: "customer@example.com",
    gameNickname: null,
  });

  const setCookie = verification.headers.get("set-cookie");
  assert.match(setCookie, /^tuki_customer_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const sessionCookie = setCookie.split(";")[0];
  const unauthorizedProfileUpdate = await request("/api/customer/profile", {
    gameNickname: "Player_One",
  }, { method: "PATCH" });
  assert.equal(unauthorizedProfileUpdate.status, 401);

  const profileUpdate = await request(
    "/api/customer/profile",
    { gameNickname: " Player_One " },
    { method: "PATCH", cookie: sessionCookie },
  );
  assert.equal(profileUpdate.status, 200);
  assert.deepEqual(await profileUpdate.json(), {
    email: "customer@example.com",
    gameNickname: "Player_One",
  });

  const invalidProfileUpdate = await request(
    "/api/customer/profile",
    { gameNickname: " " },
    { method: "PATCH", cookie: sessionCookie },
  );
  assert.equal(invalidProfileUpdate.status, 400);
  const longProfileUpdate = await request(
    "/api/customer/profile",
    { gameNickname: "x".repeat(101) },
    { method: "PATCH", cookie: sessionCookie },
  );
  assert.equal(longProfileUpdate.status, 400);

  const sessionResponse = await request("/api/customer/session", null, {
    method: "GET",
    cookie: sessionCookie,
  });
  assert.deepEqual(await sessionResponse.json(), {
    authenticated: true,
    email: "customer@example.com",
    gameNickname: "Player_One",
  });

  const createdOrderResponse = await request("/api/orders", {
    realName: "Customer Name",
    gameNickname: "Player_From_Request",
    email: "someone-else@example.com",
    paymentMethod: "Platino",
    items: [{ name: "New item", category: "Test", quantity: 1 }],
  }, {
    cookie: sessionCookie,
    headers: { "Idempotency-Key": "customer-session-order-key-123" },
  });
  const createdOrder = await createdOrderResponse.json();
  assert.equal(createdOrderResponse.status, 201);
  assert.equal(
    database.prepare("SELECT customer_email FROM orders WHERE id = ?")
      .get(createdOrder.id).customer_email,
    "customer@example.com",
  );

  const unauthorizedOrders = await fetch(`${baseUrl}/api/customer/orders`);
  assert.equal(unauthorizedOrders.status, 401);

  const ordersResponse = await request("/api/customer/orders", null, {
    method: "GET",
    cookie: sessionCookie,
  });
  const ordersResult = await ordersResponse.json();
  assert.equal(ordersResponse.status, 200);
  assert.equal(ordersResult.pagination.total, 2);
  assert.ok(ordersResult.data.some((order) => order.id === createdOrder.id));
  const existingOrder = ordersResult.data.find((order) => order.id === "owned-order");
  assert.ok(existingOrder);
  assert.deepEqual(existingOrder.items, [{
    name: "Item owned-order",
    category: "Test",
    quantity: 2,
    unitPriceCop: null,
    unitPricePlatinum: null,
  }]);
  assert.deepEqual(existingOrder.history.map((entry) => entry.status), ["Pendiente"]);
  assert.doesNotMatch(JSON.stringify(ordersResult), /tracking_token|trackingToken|customer_email/i);

  const logout = await request("/api/customer/logout", null, {
    cookie: sessionCookie,
  });
  assert.equal(logout.status, 204);
  const revokedOrders = await request("/api/customer/orders", null, {
    method: "GET",
    cookie: sessionCookie,
  });
  assert.equal(revokedOrders.status, 401);
});

test("customer login codes expire after five incorrect attempts", async () => {
  const requestCode = await request("/api/customer/auth/request-code", {
    email: "new-customer@example.com",
  });
  assert.equal(requestCode.status, 202);
  const code = extractCode(sentEmails[2]);
  const incorrectCode = code === "00000000" ? "99999999" : "00000000";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invalidCode = await request("/api/customer/auth/verify-code", {
      email: "new-customer@example.com",
      code: incorrectCode,
    });
    assert.equal(invalidCode.status, 401);
  }

  const lockedCode = await request("/api/customer/auth/verify-code", {
    email: "new-customer@example.com",
    code,
  });
  assert.equal(lockedCode.status, 401);

  const resendAfterLock = await request("/api/customer/auth/request-code", {
    email: "new-customer@example.com",
  });
  assert.equal(resendAfterLock.status, 202);
  assert.equal(sentEmails.length, 3);
});
