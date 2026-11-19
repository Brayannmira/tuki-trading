import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const testDirectory = mkdtempSync(join(tmpdir(), "tuki-customer-no-smtp-test-"));
process.env.ADMIN_USERNAME = "customer-no-smtp-test-admin";
process.env.ADMIN_PASSWORD = "customer-no-smtp-test-password";
process.env.SESSION_SECRET = "customer-no-smtp-session-secret-long-enough";
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = join(testDirectory, "orders.sqlite");
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_SECURE;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASSWORD;
delete process.env.SMTP_FROM;

const [{ createApp }, { default: database }] = await Promise.all([
  import("../app.js"),
  import("../db/database.js"),
]);

let server;
let baseUrl;

before(async () => {
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

test("customer login clearly reports when SMTP is unavailable", async () => {
  const response = await fetch(`${baseUrl}/api/customer/auth/request-code`, {
    method: "POST",
    headers: {
      origin: process.env.APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: "customer@example.com" }),
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "El acceso por correo no está disponible hasta configurar SMTP.",
  });
});
