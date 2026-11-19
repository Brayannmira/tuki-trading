import {
  clearCustomerSessionCookie,
  getCustomerOrders,
  isValidCustomerEmail,
  requestCustomerLoginCode,
  resolveCustomerSession,
  revokeCustomerSession,
  setCustomerSessionCookie,
  verifyCustomerLoginCode,
} from "../services/customerAuth.service.js";

const defaultPage = 1;
const defaultLimit = 10;
const maxLimit = 50;

function parsePositiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;

  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export async function requestLoginCode(request, response) {
  const email = request.body?.email;
  if (!isValidCustomerEmail(email)) {
    return response.status(400).json({ error: "Ingresa un correo válido." });
  }

  const result = await requestCustomerLoginCode(email);
  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  return response.status(202).json({
    message: "Si el correo puede recibir códigos, te enviaremos uno en breve.",
  });
}

export function verifyLoginCode(request, response) {
  const email = request.body?.email;
  if (!isValidCustomerEmail(email)) {
    return response.status(400).json({ error: "Ingresa un correo válido." });
  }

  const result = verifyCustomerLoginCode(email, request.body?.code);
  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  setCustomerSessionCookie(response, result.token);
  return response.json({ authenticated: true, email: result.email });
}

export function getSession(request, response) {
  const customer = resolveCustomerSession(request);
  return response.json(customer
    ? { authenticated: true, email: customer.email }
    : { authenticated: false });
}

export function logout(request, response) {
  revokeCustomerSession(request);
  clearCustomerSessionCookie(response);
  return response.status(204).end();
}

export function listOrders(request, response) {
  const page = request.query.page === undefined
    ? defaultPage
    : parsePositiveInteger(request.query.page);
  const limit = request.query.limit === undefined
    ? defaultLimit
    : parsePositiveInteger(request.query.limit);

  if (page === null || limit === null || limit > maxLimit) {
    return response.status(400).json({
      error: "Usa page y limit como enteros positivos (limit máximo 50).",
    });
  }

  return response.json(getCustomerOrders(request.customer.email, { page, limit }));
}
