import { useCallback, useEffect, useRef, useState } from "react";
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
  const [deletingOrderId, setDeletingOrderId] = useState("");
  const [lampLit, setLampLit] = useState(false);
  const audioContextRef = useRef(null);

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

  useEffect(() => () => {
    if (audioContextRef.current) {
      void audioContextRef.current.close();
    }
  }, []);

  const playLampSound = () => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;

    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(120, now + 0.05);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now + 0.05);
    oscillator.stop(now + 0.38);
  };

  const toggleLamp = () => {
    setLampLit((isLit) => !isLit);
    playLampSound();
  };

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

  const deleteOrder = async (orderId) => {
    if (!window.confirm("¿Seguro que quieres eliminar este pedido?")) return;

    setError("");
    setDeletingOrderId(orderId);

    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(orderId)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "No se pudo eliminar el pedido.");
      }

      await loadOrders();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingOrderId("");
    }
  };

  if (checkingSession) {
    return <main className="admin-page"><p>Comprobando sesión...</p></main>;
  }

  if (!authenticated) {
    return (
      <main className={`admin-login-scene${lampLit ? " lit" : ""}`}>
        <div className="room-ambient" aria-hidden="true" />
        <div className="lamp-container">
          <div className="lamp-head" aria-hidden="true" />
          <div className="lamp-neck" aria-hidden="true" />
          <div className="lamp-base" aria-hidden="true" />
          <button
            type="button"
            className="pull-cord"
            title={lampLit ? "Tira para apagar" : "Tira para encender"}
            aria-label={lampLit ? "Apagar lámpara" : "Encender lámpara"}
            aria-pressed={lampLit}
            onClick={toggleLamp}
          >
            <span className="cord-line" aria-hidden="true" />
            <span className="cord-handle" aria-hidden="true" />
          </button>
        </div>

        <section className="admin-login-panel" aria-labelledby="admin-login-title">
          <h2 id="admin-login-title">Admin Access</h2>
          <p className="admin-login-subtitle">Introduce tus credenciales de administrador</p>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <form className="admin-login-form" onSubmit={handleLogin}>
            <div className="admin-login-input-group">
              <label htmlFor="admin-username">Usuario</label>
              <input
                id="admin-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="admin-login-input-group">
              <label htmlFor="admin-password">Contraseña</label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <button className="admin-login-submit" type="submit" disabled={loading}>
              {loading ? "Ingresando..." : "Ingresar al panel"}
            </button>
          </form>
          <Link className="admin-login-back" to="/catalogo">Volver al catálogo</Link>
        </section>
      </main>
    );
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
                  <button
                    type="button"
                    className="admin-secondary-button"
                    onClick={() => deleteOrder(order.id)}
                    disabled={deletingOrderId === order.id}
                  >
                    {deletingOrderId === order.id ? "Eliminando..." : "Eliminar pedido"}
                  </button>
                </article>
              ))}
            </div>
          )}
      </section>
    </main>
  );
}



export default AdminPage;
