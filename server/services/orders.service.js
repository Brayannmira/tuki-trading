import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "../config/env.js";
import {
  deleteOrder,
  countOrders,
  insertOrder,
  saveCatalogProducts,
  saveCatalogProduct,
  selectCatalogProduct,
  selectCatalogProducts,
  selectOrderSummary,
  selectOrderStatusHistory,
  selectOrderStatus,
  selectOrdersPage,
  updateOrderStatus as saveOrderStatus,
} from "../repositories/orders.repository.js";

const allowedPaymentMethods = ["Platino", "Dinero (COP)"];
export const orderStatuses = ["Pendiente", "En proceso", "Completado", "Cancelado"];
export const catalogAvailabilityOptions = [
  "Disponible",
  "En Bóveda",
  "Oferta Especial",
  "Agotado",
  "Por confirmar",
];

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
      (item) =>
        item &&
        isValidText(item.name, 120) &&
        isValidText(item.category, 80) &&
        (item.id === undefined || isValidText(item.id, 180)) &&
        (item.quantity === undefined ||
          (Number.isSafeInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99)),
    )
  );
}

function isValidPrice(value) {
  return value === null || (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 1_000_000_000
  );
}

export function isValidCatalogProduct(productId, product) {
  return (
    isValidText(productId, 180) &&
    product &&
    isValidText(product.name, 120) &&
    isValidText(product.category, 80) &&
    isValidPrice(product.priceCop) &&
    isValidPrice(product.pricePlatinum) &&
    (product.stockQuantity === null ||
      (Number.isSafeInteger(product.stockQuantity) &&
        product.stockQuantity >= 0 &&
        product.stockQuantity <= 1_000_000)) &&
    catalogAvailabilityOptions.includes(product.availability)
  );
}

export function getCatalogProducts() {
  return selectCatalogProducts().map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    priceCop: product.price_cop,
    pricePlatinum: product.price_platinum,
    stockQuantity: product.stock_quantity,
    availability: product.availability,
    updatedAt: product.updated_at,
    popularity: product.popularity,
  }));
}

export function updateCatalogProduct(productId, productData) {
  if (!isValidCatalogProduct(productId, productData)) {
    return { error: "Revisa los precios, existencias y disponibilidad del artículo.", statusCode: 400 };
  }

  const product = {
    id: productId.trim(),
    name: productData.name.trim(),
    category: productData.category.trim(),
    priceCop: productData.priceCop,
    pricePlatinum: productData.pricePlatinum,
    stockQuantity: productData.stockQuantity,
    availability: productData.availability,
    updatedAt: new Date().toISOString(),
  };
  saveCatalogProduct(product);
  return product;
}

export function importCatalogProducts(products) {
  if (
    !Array.isArray(products) ||
    products.length === 0 ||
    products.length > 100 ||
    products.some((product) => !product || !isValidCatalogProduct(product.id, product))
  ) {
    return {
      error: "El archivo contiene artículos inválidos o excede el límite de 100 por lote.",
      statusCode: 400,
    };
  }

  const productIds = products.map((product) => product.id.trim());
  if (new Set(productIds).size !== productIds.length) {
    return { error: "El lote contiene identificadores duplicados.", statusCode: 400 };
  }

  const updatedAt = new Date().toISOString();
  saveCatalogProducts(products.map((product, index) => ({
    id: productIds[index],
    name: product.name.trim(),
    category: product.category.trim(),
    priceCop: product.priceCop,
    pricePlatinum: product.pricePlatinum,
    stockQuantity: product.stockQuantity,
    availability: product.availability,
    updatedAt,
  })));
  return { importedCount: products.length };
}

export function createOrder(orderData) {
  const requestedQuantities = new Map();
  for (const item of orderData.items) {
    if (item.id) {
      requestedQuantities.set(
        item.id,
        (requestedQuantities.get(item.id) ?? 0) + (item.quantity ?? 1),
      );
    }
  }
  for (const [productId, quantity] of requestedQuantities) {
    const product = selectCatalogProduct(productId);
    if (
      product &&
      (product.availability === "Agotado" ||
        (product.stock_quantity !== null && quantity > product.stock_quantity))
    ) {
      return {
        error: `${product.name} no tiene existencias suficientes.`,
        statusCode: 409,
      };
    }
  }

  const trackingToken = randomBytes(32).toString("base64url");
  const currency = orderData.paymentMethod === "Dinero (COP)" ? "COP" : "Platino";
  const items = orderData.items.map((item) => {
    const productId = item.id?.trim() ?? null;
    const catalogProduct = productId ? selectCatalogProduct(productId) : null;

    return {
      productId,
      name: item.name.trim(),
      category: item.category.trim(),
      quantity: item.quantity ?? 1,
      unitPriceCop: catalogProduct?.price_cop ?? null,
      unitPricePlatinum: catalogProduct?.price_platinum ?? null,
    };
  });
  const prices = items.map((item) =>
    currency === "COP" ? item.unitPriceCop : item.unitPricePlatinum,
  );
  const totalAmount = prices.every((price) => price !== null)
    ? items.reduce((total, item, index) => total + prices[index] * item.quantity, 0)
    : null;
  const order = {
    id: randomUUID(),
    trackingTokenHash: createHash("sha256").update(trackingToken).digest("hex"),
    realName: orderData.realName.trim(),
    gameNickname: orderData.gameNickname.trim(),
    paymentMethod: orderData.paymentMethod,
    currency,
    totalAmount,
    items,
    createdAt: new Date().toISOString(),
  };

  insertOrder(order);

  return {
    id: order.id,
    status: orderStatuses[0],
    createdAt: order.createdAt,
    totalAmount,
    currency,
    trackingToken,
  };
}

export function getOrders({ page, limit, status }) {
  const total = countOrders(status);
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const data = selectOrdersPage({
    limit,
    offset: (currentPage - 1) * limit,
    status,
  });

  return {
    data,
    pagination: {
      page: currentPage,
      limit,
      total,
      totalPages,
    },
    summary: selectOrderSummary(),
  };
}

export function getOrderStatus(id, trackingToken) {
  if (typeof trackingToken !== "string" || trackingToken.length !== 43) {
    return {
      error: "No se encontró el pedido o el código de seguimiento no es válido.",
      statusCode: 404,
    };
  }

  const trackingTokenHash = createHash("sha256").update(trackingToken).digest("hex");
  const order = selectOrderStatus(id, trackingTokenHash);

  if (!order) {
    return {
      error: "No se encontró el pedido o el código de seguimiento no es válido.",
      statusCode: 404,
    };
  }

  return {
    id: order.id,
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    history: selectOrderStatusHistory(order.id).map((entry) => ({
      status: entry.status,
      changedAt: entry.changed_at,
    })),
  };
}

export function changeOrderStatus(id, status) {
  if (!orderStatuses.includes(status)) {
    return { error: "El estado indicado no es válido.", statusCode: 400 };
  }

  const updatedAt = new Date().toISOString();
  const { changes, stockError } = saveOrderStatus(
    id,
    status,
    updatedAt,
    config.adminUsername,
  );
  if (stockError) {
    return { error: stockError, statusCode: 409 };
  }
  if (changes === 0) {
    return { error: "No se encontró el pedido.", statusCode: 404 };
  }

  return { id, status, updatedAt };
}

export function removeOrder(id) {
  const changes = deleteOrder(id, config.adminUsername);

  if (changes === 0) {
    return { error: "No se encontró el pedido.", statusCode: 404 };
  }

  return { id };
}