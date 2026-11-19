import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Navbar from "@/shared/components/Navbar.jsx";

function formatDate(value) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function OrderStatusPage() {
  const location = useLocation();
  const [orderId, setOrderId] = useState(() => location.state?.orderId ?? "");
  const [trackingToken, setTrackingToken] = useState(
    () => location.state?.trackingToken ?? "",
  );
  const [orderStatus, setOrderStatus] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const statusHistory = orderStatus?.history?.length
    ? orderStatus.history
    : orderStatus
      ? [{ status: orderStatus.status, changedAt: orderStatus.updatedAt }]
      : [];

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setOrderStatus(null);

    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId.trim())}/status`,
        {
          headers: { Authorization: `Bearer ${trackingToken.trim()}` },
        },
      );
      const contentType = response.headers.get("content-type") ?? "";
      const result = contentType.includes("application/json")
        ? await response.json()
        : null;

      if (!response.ok) {
        throw new Error(
          result?.error || `No se pudo consultar el pedido (HTTP ${response.status}).`,
        );
      }

      if (!result || typeof result.status !== "string") {
        throw new Error("El servidor devolvió una respuesta de seguimiento no válida.");
      }

      setOrderStatus(result);
    } catch (requestError) {
      setError(requestError.message || "No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="order-tracking-page">
      <Navbar />
      <div className="order-tracking-content">
        <section className="order-tracking-card category-section">
          <p className="order-tracking-eyebrow">Seguimiento</p>
          <h1 className="order-tracking-title">Consulta tu pedido</h1>
          <p className="order-tracking-description">
            Ingresa el número de pedido y el código de seguimiento que recibiste al enviarlo.
          </p>

          <form className="order-tracking-form" onSubmit={handleSubmit} aria-busy={loading}>
            <label>
              Número de pedido
              <input
                type="text"
                autoComplete="off"
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
                disabled={loading}
                required
              />
            </label>
            <label>
              Código de seguimiento
              <input
                type="password"
                autoComplete="off"
                minLength={43}
                maxLength={43}
                autoCapitalize="off"
                value={trackingToken}
                onChange={(event) => setTrackingToken(event.target.value)}
                disabled={loading}
                required
              />
            </label>
            <button className="trade-form-submit" type="submit" disabled={loading}>
              {loading ? "Consultando..." : "Consultar estado"}
            </button>
          </form>

          {error && <p className="trade-form-error" role="alert">{error}</p>}

          {orderStatus && (
            <section className="order-tracking-result" aria-live="polite">
              <p>Estado actual</p>
              <h2>{orderStatus.status}</h2>
              <dl>
                <div>
                  <dt>Número de pedido</dt>
                  <dd>{orderStatus.id}</dd>
                </div>
                <div>
                  <dt>Última actualización</dt>
                  <dd>{formatDate(orderStatus.updatedAt)}</dd>
                </div>
              </dl>
              <h3>Historial del pedido</h3>
              <ol className="order-status-timeline">
                {statusHistory.map((entry, index) => (
                  <li
                    className={index === statusHistory.length - 1 ? "current" : ""}
                    key={`${entry.status}-${entry.changedAt}`}
                  >
                    <span className="order-status-timeline-marker" aria-hidden="true" />
                    <span>
                      <strong>{entry.status}</strong>
                      <time dateTime={entry.changedAt}>{formatDate(entry.changedAt)}</time>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <Link className="order-tracking-back" to="/catalogo">Volver al catálogo</Link>
        </section>
      </div>
    </main>
  );
}

export default OrderStatusPage;
