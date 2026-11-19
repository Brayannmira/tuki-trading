import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSelection } from "./SelectionContext.js";

const pendingIdempotencyKeyStorageKey = "tuki-trading-pending-order-key";

function readPendingIdempotencyKey() {
  try {
    const key = sessionStorage.getItem(pendingIdempotencyKeyStorageKey);
    return key && /^[A-Za-z0-9_-]{22,128}$/.test(key) ? key : null;
  } catch (error) {
    console.error("No se pudo recuperar la clave de reintento:", error);
    return null;
  }
}

function savePendingIdempotencyKey(key) {
  try {
    sessionStorage.setItem(pendingIdempotencyKeyStorageKey, key);
  } catch (error) {
    console.error("No se pudo guardar la clave de reintento:", error);
  }
}

function clearPendingIdempotencyKey() {
  try {
    sessionStorage.removeItem(pendingIdempotencyKeyStorageKey);
  } catch (error) {
    console.error("No se pudo borrar la clave de reintento:", error);
  }
}

function Formulario() {
  const { selectedItems, toggleItem, updateQuantity, clearSelection } = useSelection();
  const [realName, setRealName] = useState("");
  const [gameNickname, setGameNickname] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Platino");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState("");
  const [createdTrackingToken, setCreatedTrackingToken] = useState("");
  const [createdOrderTotal, setCreatedOrderTotal] = useState(null);
  const [createdOrderCurrency, setCreatedOrderCurrency] = useState("");
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogError, setCatalogError] = useState("");
  const submissionInProgress = useRef(false);
  const idempotencyAttempt = useRef(undefined);
  if (idempotencyAttempt.current === undefined) {
    const pendingKey = readPendingIdempotencyKey();
    idempotencyAttempt.current = pendingKey
      ? { key: pendingKey, serializedOrder: null }
      : null;
  }
  const priceKey = paymentMethod === "Dinero (COP)" ? "priceCop" : "pricePlatinum";
  const productsById = useMemo(
    () => Object.fromEntries(catalogProducts.map((product) => [product.id, product])),
    [catalogProducts],
  );
  const getItemPrice = (item) => {
    const product = productsById[item.catalogId];
    return product ? product[priceKey] : item[priceKey] ?? null;
  };
  const hasCompletePrice = selectedItems.every((item) => getItemPrice(item) !== null);
  const estimatedTotal = hasCompletePrice
    ? selectedItems.reduce(
      (total, item) => total + getItemPrice(item) * (item.quantity ?? 1),
      0,
    )
    : null;
  const selectedQuantity = selectedItems.reduce(
    (total, item) => total + (item.quantity ?? 1),
    0,
  );

  useEffect(() => {
    let active = true;
    fetch("/api/catalog")
      .then(async (response) => {
        if (!response.ok) throw new Error(`No se pudo consultar el catálogo (HTTP ${response.status}).`);
        const products = await response.json();
        if (!Array.isArray(products)) throw new Error("El catálogo devolvió una respuesta no válida.");
        if (active) setCatalogProducts(products);
      })
      .catch((requestError) => {
        if (active) setCatalogError(requestError.message);
      });

    return () => {
      active = false;
    };
  }, []);

  const formatPrice = (amount) => amount === null
    ? "Por cotizar"
    : paymentMethod === "Dinero (COP)"
      ? `$${new Intl.NumberFormat("es-CO").format(amount)} COP`
      : `${new Intl.NumberFormat("es-CO").format(amount)} platinos`;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submissionInProgress.current || selectedItems.length === 0) return;

    const orderPayload = {
      realName,
      gameNickname,
      email,
      paymentMethod,
      items: selectedItems.map((item) => ({
        id: item.catalogId,
        name: item.name,
        category: item.category,
        quantity: item.quantity ?? 1,
      })),
    };
    const serializedOrder = JSON.stringify(orderPayload);
    if (!idempotencyAttempt.current ||
      (idempotencyAttempt.current.serializedOrder !== null &&
        idempotencyAttempt.current.serializedOrder !== serializedOrder)) {
      idempotencyAttempt.current = {
        key: globalThis.crypto.randomUUID(),
        serializedOrder,
      };
    } else {
      idempotencyAttempt.current.serializedOrder = serializedOrder;
    }
    savePendingIdempotencyKey(idempotencyAttempt.current.key);

    submissionInProgress.current = true;
    setIsSubmitting(true);
    setSubmissionError("");
    setCreatedOrderId("");
    setCreatedTrackingToken("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyAttempt.current.key,
        },
        body: serializedOrder,
      });
      const result = await response.json();

      if (!response.ok) {
        if (response.status < 500) {
          idempotencyAttempt.current = null;
          clearPendingIdempotencyKey();
        }
        throw new Error(result.error || "No se pudo enviar la solicitud.");
      }

      idempotencyAttempt.current = null;
      clearPendingIdempotencyKey();
      setCreatedOrderId(result.id);
      setCreatedTrackingToken(result.trackingToken);
      setCreatedOrderTotal(result.totalAmount);
      setCreatedOrderCurrency(result.currency);
      clearSelection();
    } catch (error) {
      setSubmissionError(error.message || "No se pudo conectar con el servidor.");
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <section id="formulario" className="category-section card-bottom-left">
      <h2>Formulario de solicitud</h2>
      <p>Completa tus datos y confirma los artículos que quieres solicitar.</p>

      <form className="trade-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
        <div className="trade-form-fields">
          <label>
            <span>Nombre real</span>
            <input
              type="text"
              autoComplete="name"
              maxLength={100}
              value={realName}
              onChange={(event) => setRealName(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </label>
          <label>
            <span>Nickname del juego</span>
            <input
              type="text"
              autoComplete="nickname"
              maxLength={100}
              value={gameNickname}
              onChange={(event) => setGameNickname(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </label>
          <label>
            <span>Correo electrónico</span>
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </label>
        </div>

        <fieldset className="payment-options">
          <legend>Forma de pago</legend>
          {["Platino", "Dinero (COP)"].map((method) => (
            <label key={method}>
              <input
                type="radio"
                name="payment-method"
                value={method}
                checked={paymentMethod === method}
                onChange={(event) => setPaymentMethod(event.target.value)}
                disabled={isSubmitting}
              />
              <span>{method}</span>
            </label>
          ))}
        </fieldset>

        <div className="selected-request-items">
          <h3>
            Artículos seleccionados <span>({selectedItems.length})</span>
          </h3>
          {selectedItems.length > 0 ? (
            <ul>
              {selectedItems.map((item) => (
                <li key={item.id}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.category}</small>
                    <small>Precio unitario: {formatPrice(getItemPrice(item))}</small>
                    <small>
                      Subtotal:{" "}
                      {getItemPrice(item) === null
                        ? "Por cotizar"
                        : formatPrice(getItemPrice(item) * (item.quantity ?? 1))}
                    </small>
                  </span>
                  <label className="cart-quantity-control">
                    Cantidad
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={item.quantity ?? 1}
                      onChange={(event) => updateQuantity(item.id, event.target.value)}
                      disabled={isSubmitting}
                    />
                  </label>
                  <button type="button" onClick={() => toggleItem(item)} disabled={isSubmitting}>
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Aún no has seleccionado artículos.{" "}
              <Link to="/catalogo">Ir al catálogo</Link>
            </p>
          )}
          {selectedItems.length > 0 && (
            <p className="cart-total" aria-live="polite">
              Total estimado ({selectedQuantity}{" "}
              {selectedQuantity === 1 ? "unidad" : "unidades"}):{" "}
              {estimatedTotal === null ? "Pendiente por cotizar" : formatPrice(estimatedTotal)}
            </p>
          )}
        </div>

        <p id="order-conditions" className="trade-form-conditions">
          Al enviar, registras una solicitud; no se realiza un cobro ni se confirma
          disponibilidad o entrega. Usaremos tu correo para avisarte cuando el pedido
          pase a “En proceso” o “Completado”. Revisaremos los artículos y te confirmaremos
          el precio final y el estado del pedido.
        </p>
        <button
          className="trade-form-submit"
          type="submit"
          aria-describedby="order-conditions"
          disabled={selectedItems.length === 0 || isSubmitting}
        >
          {isSubmitting ? "Enviando solicitud..." : "Enviar solicitud"}
        </button>
        {submissionError && <p className="trade-form-error" role="alert">{submissionError}</p>}
        {catalogError && <p className="trade-form-error" role="alert">{catalogError}</p>}
        {createdOrderId ? (
          <div className="trade-form-success" role="status" aria-live="polite">
            <p>
              Solicitud recibida. Número de pedido: <strong>{createdOrderId}</strong>
            </p>
            <p>
              Total:{" "}
              <strong>
                {createdOrderTotal === null
                  ? "Pendiente por cotizar"
                  : createdOrderCurrency === "COP"
                    ? `$${new Intl.NumberFormat("es-CO").format(createdOrderTotal)} COP`
                    : `${new Intl.NumberFormat("es-CO").format(createdOrderTotal)} platinos`}
              </strong>
            </p>
            <p>
              Código de seguimiento: <strong className="tracking-token">{createdTrackingToken}</strong>
            </p>
            <p>Guarda ambos datos; el código no se volverá a mostrar.</p>
            <Link
              to="/consultar-pedido"
              state={{ orderId: createdOrderId, trackingToken: createdTrackingToken }}
            >
              Consultar estado
            </Link>
          </div>
        ) : (
          <p className="trade-form-note">Te confirmaremos el estado de tu solicitud.</p>
        )}
      </form>
    </section>
  );
}

export default Formulario;
