import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Navbar.jsx";
import "./CustomerAccountPage.css";

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
  });
  const responseBody = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let result = null;

  if (responseBody && contentType.includes("application/json")) {
    result = JSON.parse(responseBody);
  }
  if (!response.ok) {
    throw new Error(result?.error || `No se pudo completar la solicitud (HTTP ${response.status}).`);
  }

  return result;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTotal(order) {
  if (order.totalAmount === null || order.totalAmount === undefined) {
    return "Pendiente de cotización";
  }

  const amount = new Intl.NumberFormat("es-CO").format(order.totalAmount);
  return order.currency === "Platino" ? `${amount} platinos` : `COP ${amount}`;
}

function CustomerOrder({ order }) {
  return (
    <article className="customer-order-card">
      <header className="customer-order-heading">
        <div>
          <p>Pedido</p>
          <h2>{order.id}</h2>
        </div>
        <span className="customer-order-status">{order.status}</span>
      </header>

      <dl className="customer-order-summary">
        <div>
          <dt>Fecha</dt>
          <dd>{formatDate(order.createdAt)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatTotal(order)}</dd>
        </div>
        <div>
          <dt>Pago</dt>
          <dd>{order.paymentMethod}</dd>
        </div>
      </dl>

      <section className="customer-order-items">
        <h3>Artículos</h3>
        <ul>
          {order.items.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <span>{item.name}</span>
              <span>Cantidad: {item.quantity}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="customer-order-history">
        <h3>Historial de estado</h3>
        <ol className="order-status-timeline">
          {order.history.map((entry, index) => (
            <li
              className={index === order.history.length - 1 ? "current" : ""}
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

      <p className="customer-order-notification">
        {order.notification?.status === "sent"
          ? `Aviso de estado enviado${order.notification.sentAt
            ? ` el ${formatDate(order.notification.sentAt)}`
            : ""}.`
          : order.notification
            ? "El envío del último aviso de estado no está confirmado."
            : "Aún no se ha enviado un aviso de cambio de estado."}
      </p>
    </article>
  );
}

function CustomerAccountPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [session, setSession] = useState(null);
  const [orders, setOrders] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOrders = useCallback(async (page = 1) => {
    const result = await requestJson(`/api/customer/orders?page=${page}`);
    setOrders(result);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const result = await requestJson("/api/customer/session");
        if (!active) return;
        setSession(result);
        if (result.authenticated) {
          setEmail(result.email);
          await loadOrders();
        }
      } catch (requestError) {
        if (active) setError(requestError.message || "No se pudo consultar la sesión.");
      } finally {
        if (active) setPageLoading(false);
      }
    }

    loadSession();
    return () => {
      active = false;
    };
  }, [loadOrders]);

  const handleRequestCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await requestJson("/api/customer/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setCodeRequested(true);
      setNotice(result.message);
    } catch (requestError) {
      setError(requestError.message || "No se pudo solicitar el código.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await requestJson("/api/customer/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      setSession(result);
      setEmail(result.email);
      setCode("");
      setCodeRequested(false);
      await loadOrders();
    } catch (requestError) {
      setError(requestError.message || "No se pudo verificar el código.");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await requestJson("/api/customer/logout", { method: "POST" });
      setSession({ authenticated: false });
      setOrders(null);
      setCode("");
      setCodeRequested(false);
      setNotice("Se cerró la sesión.");
    } catch (requestError) {
      setError(requestError.message || "No se pudo cerrar la sesión.");
    } finally {
      setBusy(false);
    }
  };

  const handlePageChange = async (page) => {
    setBusy(true);
    setError("");
    try {
      await loadOrders(page);
    } catch (requestError) {
      setError(requestError.message || "No se pudo cargar el historial.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="customer-account-page">
      <Navbar />
      <div className="customer-account-content">
        <section className="customer-account-panel category-section">
          <p className="customer-account-eyebrow">Tu cuenta</p>
          <h1>Mis pedidos</h1>

          {pageLoading ? (
            <p role="status">Comprobando tu sesión…</p>
          ) : session?.authenticated ? (
            <section aria-label="Historial de pedidos">
              <div className="customer-account-toolbar">
                <p>Sesión iniciada como <strong>{session.email}</strong></p>
                <button
                  className="customer-account-secondary"
                  type="button"
                  onClick={handleLogout}
                  disabled={busy}
                >
                  Cerrar sesión
                </button>
              </div>

              {orders?.data.length ? (
                <>
                  <div className="customer-order-list">
                    {orders.data.map((order) => <CustomerOrder key={order.id} order={order} />)}
                  </div>
                  {orders.pagination.totalPages > 1 && (
                    <nav className="customer-account-pagination" aria-label="Páginas de pedidos">
                      <button
                        type="button"
                        onClick={() => handlePageChange(orders.pagination.page - 1)}
                        disabled={busy || orders.pagination.page <= 1}
                      >
                        Anterior
                      </button>
                      <span>
                        Página {orders.pagination.page} de {orders.pagination.totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePageChange(orders.pagination.page + 1)}
                        disabled={
                          busy || orders.pagination.page >= orders.pagination.totalPages
                        }
                      >
                        Siguiente
                      </button>
                    </nav>
                  )}
                  <p className="customer-account-help">
                    Puedes consultar tus pedidos aquí sin usar el código de seguimiento.
                  </p>
                </>
              ) : (
                <p className="customer-account-empty">
                  No encontramos pedidos asociados a este correo. Los pedidos de invitado
                  aparecerán cuando se hayan creado usando la misma dirección verificada.
                </p>
              )}
            </section>
          ) : (
            <section className="customer-login-section">
              <p>
                Accede con el correo que usaste al hacer tus pedidos. Te enviaremos un código
                temporal; no necesitas crear ni recordar una contraseña.
              </p>
              {!codeRequested ? (
                <form className="customer-login-form" onSubmit={handleRequestCode}>
                  <label htmlFor="customer-login-email">Correo electrónico</label>
                  <input
                    id="customer-login-email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={busy}
                    required
                  />
                  <button className="trade-form-submit" type="submit" disabled={busy}>
                    {busy ? "Solicitando…" : "Enviar código"}
                  </button>
                </form>
              ) : (
                <form className="customer-login-form" onSubmit={handleVerifyCode}>
                  <p>Ingresa el código de 8 dígitos enviado a {email}.</p>
                  <label htmlFor="customer-login-code">Código de acceso</label>
                  <input
                    id="customer-login-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{8}"
                    maxLength={8}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                    disabled={busy}
                    required
                  />
                  <button className="trade-form-submit" type="submit" disabled={busy}>
                    {busy ? "Verificando…" : "Iniciar sesión"}
                  </button>
                  <button
                    className="customer-account-secondary"
                    type="button"
                    onClick={() => {
                      setCodeRequested(false);
                      setCode("");
                      setError("");
                      setNotice("");
                    }}
                    disabled={busy}
                  >
                    Cambiar correo
                  </button>
                  <button
                    className="customer-account-text-button"
                    type="button"
                    onClick={handleRequestCode}
                    disabled={busy}
                  >
                    Solicitar otro código
                  </button>
                </form>
              )}
              <p className="customer-account-help">
                Si olvidaste el código de seguimiento, no hay problema: al iniciar sesión
                podrás consultar los pedidos vinculados a este correo.
              </p>
            </section>
          )}

          {error && <p className="customer-account-error" role="alert">{error}</p>}
          {notice && <p className="customer-account-notice" role="status">{notice}</p>}
          <Link className="customer-account-back" to="/catalogo">Volver al catálogo</Link>
        </section>
      </div>
    </main>
  );
}

export default CustomerAccountPage;
