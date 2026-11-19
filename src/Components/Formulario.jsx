import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSelection } from "./SelectionContext.js";

function Formulario() {
  const { selectedItems, toggleItem, updateQuantity, clearSelection } = useSelection();
  const [realName, setRealName] = useState("");
  const [gameNickname, setGameNickname] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Platino");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState("");
  const [createdTrackingToken, setCreatedTrackingToken] = useState("");
  const [createdOrderTotal, setCreatedOrderTotal] = useState(null);
  const [createdOrderCurrency, setCreatedOrderCurrency] = useState("");
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogError, setCatalogError] = useState("");
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
    setIsSubmitting(true);
    setSubmissionError("");
    setCreatedOrderId("");
    setCreatedTrackingToken("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realName,
          gameNickname,
          paymentMethod,
          items: selectedItems.map((item) => ({
            id: item.catalogId,
            name: item.name,
            category: item.category,
            quantity: item.quantity ?? 1,
          })),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo enviar la solicitud.");
      }

      setCreatedOrderId(result.id);
      setCreatedTrackingToken(result.trackingToken);
      setCreatedOrderTotal(result.totalAmount);
      setCreatedOrderCurrency(result.currency);
      clearSelection();
    } catch (error) {
      setSubmissionError(error.message || "No se pudo conectar con el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="formulario" className="category-section card-bottom-left">
      <h2>Formulario de solicitud</h2>
      <p>Completa tus datos y confirma los artículos que quieres solicitar.</p>

      <form className="trade-form" onSubmit={handleSubmit}>
        <div className="trade-form-fields">
          <label>
            <span>Nombre real</span>
            <input
              type="text"
              autoComplete="name"
              maxLength={100}
              value={realName}
              onChange={(event) => setRealName(event.target.value)}
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
                    <small>
                      {formatPrice(getItemPrice(item))} · Subtotal:{" "}
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
                    />
                  </label>
                  <button type="button" onClick={() => toggleItem(item)}>Quitar</button>
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
              Total estimado:{" "}
              {estimatedTotal === null ? "Pendiente por cotizar" : formatPrice(estimatedTotal)}
            </p>
          )}
        </div>

        <button
          className="trade-form-submit"
          type="submit"
          disabled={selectedItems.length === 0 || isSubmitting}
        >
          {isSubmitting ? "Enviando solicitud..." : "Enviar solicitud"}
        </button>
        {submissionError && <p className="trade-form-error" role="alert">{submissionError}</p>}
        {catalogError && <p className="trade-form-note" role="status">{catalogError}</p>}
        {createdOrderId ? (
          <div className="trade-form-success" role="status">
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
