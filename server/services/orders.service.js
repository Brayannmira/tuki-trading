import { randomUUID } from "node:crypto";
import {
  deleteOrder,
  insertOrder,
  selectOrders,
  updateOrderStatus as saveOrderStatus,
} from "../repositories/orders.repository.js";

const allowedPaymentMethods = ["Platino", "Dinero (COP)"];
export const orderStatuses = ["Pendiente", "En proceso", "Completado", "Cancelado"];

function isValidText(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

export function isValidOrder(order) {
  return (
    order &&
    isValidText(order.realName, 100) &&
    isValidText(order.gameNickname, 100) &&
    allowedPaymentMethods.includes(order.paymentMethod) &&
    Array.isArray(order.items) &&
    order.items.length > 0 &&
    order.items.length <= 100 &&
    order.items.every(
      (item) => item && isValidText(item.name, 120) && isValidText(item.category, 80),
    )
  );
}

export function createOrder(orderData) {
  const order = {
    id: randomUUID(),
    realName: orderData.realName.trim(),
    gameNickname: orderData.gameNickname.trim(),
    paymentMethod: orderData.paymentMethod,
    items: orderData.items.map((item) => ({
      name: item.name.trim(),
      category: item.category.trim(),
    })),
    createdAt: new Date().toISOString(),
  };

  insertOrder(order);

  return { id: order.id, status: orderStatuses[0], createdAt: order.createdAt };
}

export function getOrders() {
  return selectOrders();
}

export function changeOrderStatus(id, status) {
  if (!orderStatuses.includes(status)) {
    return { error: "El estado indicado no es válido.", statusCode: 400 };
  }

  const updatedAt = new Date().toISOString();
  const changes = saveOrderStatus(id, status, updatedAt);
  if (changes === 0) {
    return { error: "No se encontró el pedido.", statusCode: 404 };
  }

  return { id, status, updatedAt };
}

export function removeOrder(id) {
  const changes = deleteOrder(id);

  if (changes === 0) {
    return { error: "No se encontró el pedido.", statusCode: 404 };
  }

  return { id };
}