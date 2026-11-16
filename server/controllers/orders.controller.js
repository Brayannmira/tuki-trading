import {
  changeOrderStatus as saveOrderStatus,
  createOrder as saveOrder,
  getOrders,
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