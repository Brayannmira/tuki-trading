import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ShoppingBag, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

const AdminOrdersChart = lazy(() => import("./AdminOrdersChart.jsx"));

const orderStatuses = ["Pendiente", "En proceso", "Completado", "Cancelado"];

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDashboardMetrics(orders) {
  const today = new Date();
  const chartDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    date.setDate(date.getDate() - (6 - index));
    return {
      dateKey: getLocalDateKey(date),
      name: new Intl.DateTimeFormat("es-CO", { weekday: "short" })
        .format(date)
        .replace(".", ""),
      pedidos: 0,
    };
  });
  const ordersByDay = new Map(chartDays.map(({ dateKey }) => [dateKey, 0]));

  for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;

    const dateKey = getLocalDateKey(createdAt);
    if (ordersByDay.has(dateKey)) {
      ordersByDay.set(dateKey, ordersByDay.get(dateKey) + 1);
    }
  }

  return {
    thisMonth: orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return (
        !Number.isNaN(createdAt.getTime()) &&
        createdAt.getFullYear() === today.getFullYear() &&
        createdAt.getMonth() === today.getMonth()
      );
    }).length,
    active: orders.filter((order) => ["Pendiente", "En proceso"].includes(order.status)).length,
    completed: orders.filter((order) => order.status === "Completado").length,
    cancelled: orders.filter((order) => order.status === "Cancelado").length,
    chartData: chartDays.map(({ dateKey, ...day }) => ({
      ...day,
      pedidos: ordersByDay.get(dateKey),
    })),
  };
}

function StatsCard({ title, value, detail, icon: Icon, variant }) {
  return (
    <motion.article className="admin-stat-card" whileHover={{ y: -5 }}>
      <div className="admin-stat-card-top">
        <div>
          <p className="admin-stat-title">{title}</p>
          <p className="admin-stat-value">{new Intl.NumberFormat("es-CO").format(value)}</p>
        </div>
        <span className={`admin-stat-icon ${variant}`}>
          <Icon size={21} aria-hidden="true" />
        </span>
      </div>
      <p className="admin-stat-detail">{detail}</p>
    </motion.article>
  );
}

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
  const [orderStatusFilter, setOrderStatusFilter] = useState("Todos");
  const audioContextRef = useRef(null);
  const dashboardMetrics = useMemo(() => getDashboardMetrics(orders), [orders]);
  const visibleOrders = useMemo(
    () => orderStatusFilter === "Todos"
      ? orders
      : orders.filter((order) => order.status === orderStatusFilter),
    [orders, orderStatusFilter],
  );

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

      <section className="admin-dashboard" aria-labelledby="admin-dashboard-title">
        <div className="admin-dashboard-heading">
          <div>
            <h2 id="admin-dashboard-title">Resumen de pedidos</h2>
            <p>Actividad basada en las solicitudes registradas.</p>
          </div>
        </div>

        <div className="admin-stats-grid">
          <StatsCard
            title="Pedidos este mes"
            value={dashboardMetrics.thisMonth}
            detail="Solicitudes registradas este mes"
            icon={ShoppingBag}
            variant="orders"
          />
          <StatsCard
            title="Pedidos activos"
            value={dashboardMetrics.active}
            detail="Pendientes o en proceso"
            icon={Clock}
            variant="active"
          />
          <StatsCard
            title="Completados"
            value={dashboardMetrics.completed}
            detail="Pedidos completados"
            icon={CheckCircle2}
            variant="completed"
          />
          <StatsCard
            title="Cancelados"
            value={dashboardMetrics.cancelled}
            detail="Pedidos cancelados"
            icon={XCircle}
            variant="cancelled"
          />
        </div>

        <section className="admin-chart-card" aria-labelledby="admin-chart-title">
          <div className="admin-chart-heading">
            <div>
              <h3 id="admin-chart-title">Flujo de pedidos</h3>
              <p>Pedidos recibidos durante los últimos 7 días</p>
            </div>
            <span className="admin-chart-range">Últimos 7 días</span>
          </div>

          <Suspense fallback={<div className="admin-chart admin-chart-loading">Cargando gráfica...</div>}>
            <AdminOrdersChart data={dashboardMetrics.chartData} />
          </Suspense>
        </section>
      </section>

      <section className="admin-orders">
        <div className="admin-orders-heading">
          <div>
            <h2>Solicitudes recibidas</h2>
            <p>{visibleOrders.length} de {orders.length} pedidos</p>
          </div>
          <div className="admin-order-tools">
            <label htmlFor="admin-order-status-filter">Filtrar por estado</label>
            <select
              id="admin-order-status-filter"
              value={orderStatusFilter}
              onChange={(event) => setOrderStatusFilter(event.target.value)}
            >
              <option value="Todos">Todos</option>
              {orderStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => loadOrders().catch((requestError) => setError(requestError.message))}
            >
              Actualizar
            </button>
          </div>
        </div>

        {visibleOrders.length === 0 ? (
          <p className="admin-empty">
            {orders.length === 0
              ? "Todavía no hay pedidos."
              : "No hay pedidos con el estado seleccionado."}
          </p>
        ) : (
          <div className="admin-order-list">
            {visibleOrders.map((order) => (
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
