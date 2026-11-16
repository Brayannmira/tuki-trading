import {
  changeOrderStatus as saveOrderStatus,
  createOrder as saveOrder,
  getOrders,
  getOrderStatus as lookupOrderStatus,
  isValidOrder,
  removeOrder,
} from "../services/orders.service.js";

export function createOrder(request, response) {
  const orderData = request.body ?? {};

  if (!isValidOrder(orderData)) {
    return response.status(400).json({ error: "Revisa los datos y artículos de la solicitud." });
  }

  response.status(201).json(saveOrder(orderData));
}

export function listOrders(_request, response) {
  response.json(getOrders());
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

export function updateOrderStatus(request, response) {
  const result = saveOrderStatus(request.params.id, request.body?.status);

  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  response.json(result);
}

export function deleteOrder(request, response) {
  const result = removeOrder(request.params.id);

  if (result.error) {
    return response.status(result.statusCode).json({ error: result.error });
  }

  return response.status(204).end();
}