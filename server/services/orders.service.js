import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { config } from "../config/env.js";
import {
  deleteOrder,
  countOrders,
  insertOrder,
  saveCatalogProducts,
  saveCatalogProduct,
  selectCatalogProduct,
  selectCatalogProducts,
  selectIdempotentOrder,
  selectOrderSummary,
  selectOrderStatusHistory,
  selectOrderStatusNotification,
  recordOrderStatusNotificationAttempt,
  markOrderStatusNotificationFailed,
  markOrderStatusNotificationSent,
  selectOrderStatus,
  selectOrdersPage,
  selectAdminAuditLog,
  countAdminAuditLog,
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

function isValidEmail(value) {
  return isValidText(value, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidOrder(order) {
  return (
    order &&
    isValidText(order.realName, 100) &&
    isValidText(order.gameNickname, 100) &&
    isValidEmail(order.email) &&
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

export function isValidIdempotencyKey(key) {
  return typeof key === "string" && /^[A-Za-z0-9_-]{22,128}$/.test(key);
}

function createIdempotencyContext(orderData, key) {
  const normalizedOrder = {
    realName: orderData.realName.trim(),
    gameNickname: orderData.gameNickname.trim(),
    email: orderData.email.trim(),
    paymentMethod: orderData.paymentMethod,
    items: orderData.items.map((item) => ({
      id: item.id?.trim() ?? null,
      name: item.name.trim(),
      category: item.category.trim(),
      quantity: item.quantity ?? 1,
    })),
  };
  const requestHash = createHmac("sha256", key)
    .update("tuki-order-request:")
    .update(JSON.stringify(normalizedOrder))
    .digest("hex");
  const keyHash = createHash("sha256")
    .update("tuki-order-idempotency-key:")
    .update(key)
    .digest("hex");

  return { keyHash, requestHash };
}

function getTrackingTokenEncryptionKey(idempotencyKey) {
  return createHmac("sha256", idempotencyKey)
    .update("tuki-order-tracking-token-encryption:")
    .digest();
}

function encryptTrackingToken(token, idempotencyKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getTrackingTokenEncryptionKey(idempotencyKey),
    iv,
  );
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptTrackingToken(encryptedToken, idempotencyKey) {
  const [encodedIv, encodedAuthTag, encodedCiphertext, extra] = encryptedToken.split(".");
  if (!encodedIv || !encodedAuthTag || !encodedCiphertext || extra) {
    throw new Error("No se pudo recuperar el resultado de la solicitud idempotente.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getTrackingTokenEncryptionKey(idempotencyKey),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function resultFromIdempotentOrder(order, requestHash, idempotencyKey) {
  if (order.idempotency_request_hash !== requestHash) {
    return {
      error: "La clave de reintento ya se usó con una solicitud diferente.",
      statusCode: 409,
    };
  }

  return {
    id: order.id,
    status: order.status,
    createdAt: order.created_at,
    totalAmount: order.total_amount,
    currency: order.currency,
    trackingToken: decryptTrackingToken(order.tracking_token_encrypted, idempotencyKey),
  };
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

export function createOrder(orderData, idempotencyKey) {
  if (idempotencyKey !== undefined && idempotencyKey !== null &&
    !isValidIdempotencyKey(idempotencyKey)) {
    return { error: "La clave de reintento no es válida.", statusCode: 400 };
  }

  const idempotencyContext = idempotencyKey
    ? createIdempotencyContext(orderData, idempotencyKey)
    : null;
  if (idempotencyContext) {
    const existingOrder = selectIdempotentOrder(idempotencyContext.keyHash);
    if (existingOrder) {
      return resultFromIdempotentOrder(
        existingOrder,
        idempotencyContext.requestHash,
        idempotencyKey,
      );
    }
  }

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
    idempotencyKeyHash: idempotencyContext?.keyHash,
    idempotencyRequestHash: idempotencyContext?.requestHash,
    trackingTokenEncrypted: idempotencyContext
      ? encryptTrackingToken(trackingToken, idempotencyKey)
      : null,
    realName: orderData.realName.trim(),
    gameNickname: orderData.gameNickname.trim(),
    customerEmail: orderData.email.trim(),
    paymentMethod: orderData.paymentMethod,
    currency,
    totalAmount,
    items,
    createdAt: new Date().toISOString(),
  };

  try {
    const insertResult = insertOrder(order);
    if (insertResult.existingOrder) {
      return resultFromIdempotentOrder(
        insertResult.existingOrder,
        idempotencyContext.requestHash,
        idempotencyKey,
      );
    }
  } catch (error) {
    if (error.statusCode === 409) {
      return { error: error.message, statusCode: 409 };
    }
    throw error;
  }

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
  const { changes, stockError, notificationId } = saveOrderStatus(
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

  return { id, status, updatedAt, notificationId };
}

export async function deliverOrderStatusNotification(notificationId) {
  const notification = selectOrderStatusNotification(notificationId);
  if (!notification) {
    return { error: "No se encontró la notificación.", statusCode: 404 };
  }
  if (notification.delivery_status === "sent") {
    return { id: notification.id, status: "sent" };
  }
  if (!config.smtp) {
    return {
      id: notification.id,
      status: "pending",
      message: "El correo está pendiente: configura SMTP para habilitar los envíos.",
    };
  }

  recordOrderStatusNotificationAttempt(notification.id);
  try {
    const { sendStatusEmail } = await import("./smtp.service.js");
    await sendStatusEmail({
      recipient: notification.recipient_email,
      orderId: notification.order_id,
      status: notification.status,
    });
    markOrderStatusNotificationSent(notification.id, new Date().toISOString());
    return { id: notification.id, status: "sent" };
  } catch (error) {
    console.error("No se pudo enviar la notificación del pedido:", error);
    markOrderStatusNotificationFailed(
      notification.id,
      "No se pudo enviar el correo. Revisa la configuración y vuelve a intentarlo.",
    );
    return {
      id: notification.id,
      status: "failed",
      message: "El estado cambió, pero no se pudo enviar el correo. Puedes reintentarlo.",
    };
  }
}

export function removeOrder(id) {
  const changes = deleteOrder(id, config.adminUsername);

  if (changes === 0) {
    return { error: "No se encontró el pedido.", statusCode: 404 };
  }

  return { id };
}

export function getAdminAuditLog({ page, limit }) {
  const total = countAdminAuditLog();
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const currentPage = Math.min(page, totalPages);

  return {
    data: selectAdminAuditLog({
      limit,
      offset: (currentPage - 1) * limit,
    }),
    pagination: {
      page: currentPage,
      limit,
      total,
      totalPages,
    },
  };
}