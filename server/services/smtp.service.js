import nodemailer from "nodemailer";
import { config } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.password,
  },
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
});

export async function sendStatusEmail({ recipient, orderId, status }) {
  const trackingUrl = new URL("/consultar-pedido", config.appOrigin).toString();
  const result = await transporter.sendMail({
    from: config.smtp.from,
    to: recipient,
    subject: `Actualización de tu pedido ${orderId}`,
    text: [
      `El estado de tu pedido ${orderId} cambió a: ${status}.`,
      `Puedes consultar el estado en ${trackingUrl}.`,
      "Ten a mano tu número de pedido y código de seguimiento.",
    ].join("\n\n"),
    html: `
      <p>El estado de tu pedido <strong>${orderId}</strong> cambió a:
      <strong>${status}</strong>.</p>
      <p><a href="${trackingUrl}">Consultar estado del pedido</a></p>
      <p>Ten a mano tu número de pedido y código de seguimiento.</p>
    `,
  });
  if (result.rejected.includes(recipient) || !result.accepted.includes(recipient)) {
    throw new Error("El servidor SMTP rechazó el correo del cliente.");
  }
}

export async function sendCustomerLoginCode({ recipient, code }) {
  const result = await transporter.sendMail({
    from: config.smtp.from,
    to: recipient,
    subject: "Tu código de acceso a Tuki Trading",
    text: `Tu código de acceso es: ${code}\n\nVence en 10 minutos. Si no solicitaste este código, puedes ignorar este mensaje.`,
    html: `<p>Tu código de acceso es:</p><p><strong>${code}</strong></p><p>Vence en 10 minutos. Si no solicitaste este código, puedes ignorar este mensaje.</p>`,
  });
  if (result.rejected.includes(recipient) || !result.accepted.includes(recipient)) {
    throw new Error("El servidor SMTP rechazó el correo de acceso.");
  }
}
