import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

const orderStatuses = ["Pendiente", "En proceso", "Completado", "Cancelado"];

async function readJsonResponse(response) {
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "No se pudo completar la solicitud.");
  }

  return result;
}

function AdminPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    const response = await fetch("/api/admin/orders", { credentials: "same-origin" });
    setOrders(await readJsonResponse(response));
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/admin/session", { credentials: "same-origin" })
      .then(readJsonResponse)
      .then(async (session) => {
        if (!active || !session.authenticated) return;
        setAuthenticated(true);
        await loadOrders();
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, [loadOrders]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      await readJsonResponse(response);
      setAuthenticated(true);
      setPassword("");
      await loadOrders();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    setError("");

    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await readJsonResponse(response);
      await loadOrders();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("No se pudo cerrar la sesión.");
      setAuthenticated(false);
      setOrders([]);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (checkingSession) {
    return <main className="admin-page"><p>Comprobando sesión...</p></main>;
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Panel privado</p>
          <h1>Gestión de pedidos</h1>
        </div>
        {authenticated && (
          <button type="button" className="admin-secondary-button" onClick={handleLogout}>
            Cerrar sesión
          </button>
        )}
      </header>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {!authenticated ? (
        <form className="admin-login category-section" onSubmit={handleLogin}>
          <h2>Iniciar sesión</h2>
          <label>
            Usuario
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="trade-form-submit" type="submit" disabled={loading}>
            {loading ? "Ingresando..." : "Entrar"}
          </button>
          <Link to="/catalogo">Volver al catálogo</Link>
        </form>
      ) : (
        <section className="admin-orders">
          <div className="admin-orders-heading">
            <h2>Solicitudes recibidas</h2>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => loadOrders().catch((requestError) => setError(requestError.message))}
            >
              Actualizar
            </button>
          </div>

          {orders.length === 0 ? (
            <p className="admin-empty">Todavía no hay pedidos.</p>
          ) : (
            <div className="admin-order-list">
              {orders.map((order) => (
                <article className="admin-order-card" key={order.id}>
                  <div className="admin-order-topline">
                    <div>
                      <h3>{order.realName}</h3>
                      <p>
                        Nickname: <strong>{order.gameNickname}</strong>
                        <span> · </span>
                        {order.paymentMethod}
                      </p>
                    </div>
                    <time dateTime={order.createdAt}>
                      {new Intl.DateTimeFormat("es-CO", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(order.createdAt))}
                    </time>
                  </div>
                  <ul className="admin-order-items">
                    {order.items.map((item, index) => (
                      <li key={`${item.name}-${item.category}-${index}`}>
                        {item.name} <small>{item.category}</small>
                      </li>
                    ))}
                  </ul>
                  <label className="admin-status-label">
                    Estado del pedido
                    <select
                      value={order.status}
                      onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                    >
                      {orderStatuses.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default AdminPage;
