import {
  changeOrderStatus as saveOrderStatus,
  createOrder as saveOrder,
  getOrders,
  getOrderStatus as lookupOrderStatus,
  isValidOrder,
  orderStatuses,
  removeOrder,
  getAdminAuditLog,
  isValidIdempotencyKey,
  deliverOrderStatusNotification,
} from "../services/orders.service.js";

const defaultPage = 1;
const defaultLimit = 10;
const maxLimit = 50;

function parsePositiveInteger(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;

  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function createOrder(request, response) {
  const orderData = request.body ?? {};
  const idempotencyKey = request.get("Idempotency-Key");

  if (idempotencyKey !== undefined && !isValidIdempotencyKey(idempotencyKey)) {
    return response.status(400).json({ error: "La clave de reintento no es válida." });
  }

  if (!isValidOrder(orderData)) {
    return response.status(400).json({ error: "Revisa los datos y artículos de la solicitud." });
  }

  const result = saveOrder(orderData, idempotencyKey);
  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  return response.status(201).json(result);
}

export function listOrders(request, response) {
  const page = request.query.page === undefined
    ? defaultPage
    : parsePositiveInteger(request.query.page);
  const limit = request.query.limit === undefined
    ? defaultLimit
    : parsePositiveInteger(request.query.limit);
  const status = request.query.status === undefined ? "Todos" : request.query.status;

  if (
    page === null ||
    limit === null ||
    limit > maxLimit ||
    typeof status !== "string" ||
    !["Todos", ...orderStatuses].includes(status)
  ) {
    return response.status(400).json({
      error: "Usa page y limit como enteros positivos (limit máximo 50) y un estado válido.",
    });
  }

  return response.json(getOrders({ page, limit, status }));
}

export function getOrderStatus(request, response) {
  const authorization = request.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization);
  const result = lookupOrderStatus(request.params.id, match?.[1]);

  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  return response.json(result);
}

export async function updateOrderStatus(request, response) {
  const result = saveOrderStatus(request.params.id, request.body?.status);

  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  const notification = result.notificationId
    ? await deliverOrderStatusNotification(result.notificationId)
    : null;
  return response.json({
    id: result.id,
    status: result.status,
    updatedAt: result.updatedAt,
    notification,
  });
}

export async function retryOrderStatusNotification(request, response) {
  const notificationId = parsePositiveInteger(request.params.notificationId);
  if (notificationId === null) {
    return response.status(400).json({ error: "El identificador de notificación no es válido." });
  }

  const result = await deliverOrderStatusNotification(notificationId);
  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }
  return response.json(result);
}

export function deleteOrder(request, response) {
  const result = removeOrder(request.params.id);

  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  return response.status(204).end();
}

export function listAdminAudit(request, response) {
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

  return response.json(getAdminAuditLog({ page, limit }));
}