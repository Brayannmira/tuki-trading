import assert from "node:assert/strict";
import { mock, test } from "node:test";
import process from "node:process";

process.env.ADMIN_USERNAME = "smtp-test-admin";
process.env.ADMIN_PASSWORD = "smtp-test-password";
process.env.SESSION_SECRET = "smtp-test-session-secret-long-enough";
process.env.APP_ORIGIN = "https://tuki.example";
process.env.SMTP_HOST = "smtp.example";
process.env.SMTP_PORT = "587";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "mailer";
process.env.SMTP_PASSWORD = "smtp-test-password";
process.env.SMTP_FROM = "Tuki Trading <orders@tuki.example>";

let transportOptions;
const sentMessages = [];
const nodemailer = await import("nodemailer");
mock.method(nodemailer.default, "createTransport", (options) => {
  transportOptions = options;
  return {
    sendMail: async (message) => {
      sentMessages.push(message);
      return { accepted: [message.to], rejected: [] };
    },
  };
});

const { sendCustomerLoginCode, sendStatusEmail } = await import("../services/smtp.service.js");

test("sends a status email without exposing the tracking token", async () => {
  await sendStatusEmail({
    recipient: "customer@example.com",
    orderId: "order-123",
    status: "En proceso",
  });

  assert.equal(transportOptions.host, "smtp.example");
  assert.equal(transportOptions.port, 587);
  assert.equal(transportOptions.secure, false);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, "customer@example.com");
  assert.match(sentMessages[0].subject, /order-123/);
  assert.match(sentMessages[0].text, /En proceso/);
  assert.match(sentMessages[0].html, /\/consultar-pedido/);
  assert.equal(JSON.stringify(sentMessages[0]).includes("trackingToken"), false);
});

test("sends a customer login code by email", async () => {
  await sendCustomerLoginCode({
    recipient: "customer@example.com",
    code: "01234567",
  });

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[1].to, "customer@example.com");
  assert.match(sentMessages[1].subject, /código de acceso/i);
  assert.match(sentMessages[1].text, /01234567/);
  assert.match(sentMessages[1].html, /01234567/);
  assert.match(sentMessages[1].text, /10 minutos/);
});
