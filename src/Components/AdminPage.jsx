import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  Download,
  Lock,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import CatalogAdminPanel from "./CatalogAdminPanel.jsx";

const AdminOrdersChart = lazy(() => import("./AdminOrdersChart.jsx"));

const orderStatuses = ["Pendiente", "En proceso", "Completado", "Cancelado"];
const ordersPerPage = 10;
const orderStatusClasses = {
  Pendiente: "pending",
  "En proceso": "processing",
  Completado: "completed",
  Cancelado: "cancelled",
};

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDashboardMetrics(summary) {
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
  const ordersByDay = new Map(
    (summary.chartData ?? []).map(({ dateKey, pedidos }) => [dateKey, pedidos]),
  );

  return {
    thisMonth: summary.thisMonth,
    active: summary.active,
    completed: summary.completed,
    cancelled: summary.cancelled,
    chartData: chartDays.map(({ dateKey, ...day }) => ({
      ...day,
      pedidos: ordersByDay.get(dateKey),
    })),
  };
}

function StatsCard({ title, value, detail, icon: Icon, variant, reduceMotion }) {
  return (
    <motion.article
      className="admin-stat-card"
      variants={{
        hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
      }}
      whileHover={reduceMotion ? undefined : { y: -5 }}
    >
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
  const responseBody = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    if (!responseBody) {
      throw new Error(
        `La API respondió sin contenido (HTTP ${response.status}). En desarrollo, inicia npm.cmd run server en otra terminal y verifica que Vite pueda acceder a /api.`,
      );
    }

    if (!contentType.includes("application/json")) {
      throw new Error(
        `La API devolvió una respuesta inesperada (HTTP ${response.status}). En desarrollo, inicia npm.cmd run server en otra terminal y verifica que Vite pueda acceder a /api.`,
      );
    }
  }

  if (!responseBody) {
    throw new Error(
      `La API respondió sin contenido (HTTP ${response.status}). En desarrollo, inicia npm.cmd run server en otra terminal y verifica que Vite pueda acceder a /api.`,
    );
  }

  if (!contentType.includes("application/json")) {
    throw new Error(
      `La API devolvió un formato inesperado (HTTP ${response.status}). Comprueba que la solicitud llegue al servidor Express.`,
    );
  }

  let result;
  try {
    result = JSON.parse(responseBody);
  } catch {
    throw new Error(
      `La API devolvió JSON incompleto o inválido (HTTP ${response.status}). Verifica que el servidor esté funcionando correctamente.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : `No se pudo completar la solicitud (HTTP ${response.status}).`,
    );
  }

  return result;
}

function AdminPage() {
  const prefersReducedMotion = useReducedMotion();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: ordersPerPage,
    total: 0,
    totalPages: 0,
  });
  const [dashboardSummary, setDashboardSummary] = useState({
    thisMonth: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
    chartData: [],
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState("");
  const [retryingNotificationId, setRetryingNotificationId] = useState(null);
  const [vaultOpening, setVaultOpening] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState("Todos");
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const vaultCompletionStarted = useRef(false);
  const orderRequestId = useRef(0);
  const dashboardMetrics = useMemo(
    () => getDashboardMetrics(dashboardSummary),
    [dashboardSummary],
  );

  const loadOrders = useCallback(async (requestedPage, status) => {
    const requestId = ++orderRequestId.current;
    const query = new URLSearchParams({
      page: String(requestedPage),
      limit: String(ordersPerPage),
      status,
    });
    setLoadingOrders(true);
    try {
      const response = await fetch(`/api/admin/orders?${query}`, {
        credentials: "same-origin",
      });
      const result = await readJsonResponse(response);
      if (requestId !== orderRequestId.current) return;

      setOrders(result.data);
      setPagination(result.pagination);
      setDashboardSummary(result.summary);
      setPage(result.pagination.page);
    } finally {
      if (requestId === orderRequestId.current) setLoadingOrders(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const response = await fetch("/api/admin/audit?limit=50", {
        credentials: "same-origin",
      });
      const result = await readJsonResponse(response);
      setAuditEntries(result.data);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/admin/session", { credentials: "same-origin" })
      .then(readJsonResponse)
      .then(async (session) => {
        if (!active || !session.authenticated) return;
        setAuthenticated(true);
        await loadOrders(1, "Todos");
        await loadAudit();
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
      orderRequestId.current += 1;
    };
  }, [loadOrders, loadAudit]);

  const completeVaultOpening = () => {
    if (vaultCompletionStarted.current) return;

    vaultCompletionStarted.current = true;
    setAuthenticated(true);
    setVaultOpening(false);
    loadOrders(page, orderStatusFilter)
      .catch((requestError) => setError(requestError.message));
    loadAudit().catch((requestError) => setError(requestError.message));
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
      setPassword("");
      setNotice("");
      vaultCompletionStarted.current = false;
      if (prefersReducedMotion) {
        setAuthenticated(true);
        await loadOrders(page, orderStatusFilter);
      } else {
        setVaultOpening(true);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (newPassword !== confirmPassword) {
      setError("La nueva contraseña y su confirmación no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      await readJsonResponse(response);
      setAuthenticated(false);
      setOrders([]);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Contraseña cambiada. Inicia sesión con la nueva contraseña.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await readJsonResponse(response);
      if (result.notification?.status === "sent") {
        setNotice("Estado actualizado y aviso enviado al cliente.");
      } else if (result.notification) {
        setError(result.notification.message);
      } else {
        setNotice("Estado del pedido actualizado.");
      }
      await loadOrders(page, orderStatusFilter);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const retryNotification = async (notificationId) => {
    setRetryingNotificationId(notificationId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/notifications/${notificationId}/retry`,
        {
          method: "POST",
          credentials: "same-origin",
        },
      );
      const result = await readJsonResponse(response);
      if (result.status === "sent") {
        setNotice("Aviso enviado al cliente.");
      } else {
        setError(result.message || "El aviso sigue pendiente de envío.");
      }
      await loadOrders(page, orderStatusFilter);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRetryingNotificationId(null);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("No se pudo cerrar la sesión.");
      orderRequestId.current += 1;
      setAuthenticated(false);
      setOrders([]);
      setLoadingOrders(false);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const downloadBackup = async () => {
    setError("");
    setNotice("");
    setBackupLoading(true);
    try {
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        await readJsonResponse(response);
        throw new Error("No se pudo crear el respaldo.");
      }

      const backupBlob = await response.blob();
      const fileName = response.headers.get("content-disposition")
        ?.match(/filename="?([^";]+)"?/)?.[1] ?? "tuki-trading-backup.sqlite";
      const downloadUrl = URL.createObjectURL(backupBlob);
      const downloadLink = document.createElement("a");
      downloadLink.href = downloadUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      setNotice("Respaldo de la base de datos descargado.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBackupLoading(false);
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

      await loadOrders(page, orderStatusFilter);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingOrderId("");
    }
  };

  const changePage = async (nextPage) => {
    setError("");
    try {
      await loadOrders(nextPage, orderStatusFilter);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const changeStatusFilter = (event) => {
    const status = event.target.value;
    setOrderStatusFilter(status);
    setPage(1);
    setError("");
    loadOrders(1, status).catch((requestError) => setError(requestError.message));
  };

  if (checkingSession) {
    return <main className="admin-page"><p>Comprobando sesión...</p></main>;
  }

  if (!authenticated) {
    return (
      <main className="admin-login-scene vault-scene">
        <div className="vault-ambient" aria-hidden="true" />
        <div className="vault-grid" aria-hidden="true" />
        <div className="vault-content">
          <AnimatePresence mode="wait" initial={false}>
            {!vaultOpening ? (
              <motion.section
                key="vault-login"
                className="admin-login-panel vault-login-panel"
                aria-labelledby="admin-login-title"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={prefersReducedMotion ? undefined : {
                  opacity: 0,
                  scale: 1.08,
                  filter: "blur(10px)",
                }}
                transition={{ duration: 0.45 }}
              >
                <div className="vault-decorative-ring" aria-hidden="true" />
                <div className="vault-login-heading">
                  <span className="vault-lock-icon">
                    <Lock size={23} aria-hidden="true" />
                  </span>
                  <div>
                    <h1 id="admin-login-title">Acceso a bodega</h1>
                    <p className="admin-login-subtitle">Protocolo seguro · Tuki Trading</p>
                  </div>
                </div>
                {notice && <p className="admin-notice" role="status">{notice}</p>}
                {error && <p className="admin-error" role="alert">{error}</p>}
                <form className="admin-login-form" onSubmit={handleLogin}>
                  <div className="admin-login-input-group">
                    <label htmlFor="admin-username">Identificador</label>
                    <input
                      id="admin-username"
                      type="text"
                      autoComplete="username"
                      placeholder="Usuario administrador"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      required
                    />
                  </div>
                  <div className="admin-login-input-group">
                    <label htmlFor="admin-password">Llave de acceso</label>
                    <input
                      id="admin-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Contraseña"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>
                  <motion.button
                    className="admin-login-submit vault-login-submit"
                    type="submit"
                    disabled={loading}
                    whileHover={prefersReducedMotion ? undefined : {
                      scale: 1.02,
                      boxShadow: "0 0 22px rgba(212, 175, 55, 0.28)",
                    }}
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                  >
                    <ShieldCheck size={18} aria-hidden="true" />
                    {loading ? "Verificando..." : "Desbloquear bodega"}
                  </motion.button>
                </form>
                <Link className="admin-login-back" to="/catalogo">Volver al catálogo</Link>
              </motion.section>
            ) : (
              <motion.section
                key="vault-opening"
                className="vault-opening"
                aria-live="polite"
                aria-label="Abriendo acceso administrativo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="vault-iris"
                  initial={{ scale: 0.65, opacity: 1 }}
                  animate={{ scale: 12, opacity: 0 }}
                  transition={{ duration: 1.35, ease: [0.22, 1, 0.36, 1] }}
                  onAnimationComplete={completeVaultOpening}
                  aria-hidden="true"
                />
                <motion.p
                  className="vault-granted"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.45 }}
                >
                  Acceso concedido
                </motion.p>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    );
  }

  return (
    <motion.main
      className="admin-page"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
    >
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Sistema Tuki Trading · Módulo administrativo</p>
          <h1>Control de pedidos</h1>
        </div>
        <div className="admin-header-actions">
          <span className="admin-access-badge">
            <ShieldCheck size={15} aria-hidden="true" />
            Acceso administrador
          </span>
          <button
            type="button"
            className="admin-secondary-button"
            onClick={downloadBackup}
            disabled={backupLoading}
          >
            <Download size={15} aria-hidden="true" />
            {backupLoading ? "Creando respaldo..." : "Descargar respaldo"}
          </button>
          <button type="button" className="admin-secondary-button" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <section className="admin-dashboard" aria-labelledby="admin-dashboard-title">
        <div className="admin-dashboard-heading">
          <div>
            <h2 id="admin-dashboard-title">Resumen de pedidos</h2>
            <p>Actividad basada en las solicitudes registradas.</p>
          </div>
        </div>

        <motion.div
          className="admin-stats-grid"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: prefersReducedMotion ? 0 : 0.08 } },
          }}
        >
          <StatsCard
            title="Pedidos este mes"
            value={dashboardMetrics.thisMonth}
            detail="Solicitudes registradas este mes"
            icon={ShoppingBag}
            variant="orders"
            reduceMotion={prefersReducedMotion}
          />
          <StatsCard
            title="Pedidos activos"
            value={dashboardMetrics.active}
            detail="Pendientes o en proceso"
            icon={Clock}
            variant="active"
            reduceMotion={prefersReducedMotion}
          />
          <StatsCard
            title="Completados"
            value={dashboardMetrics.completed}
            detail="Pedidos completados"
            icon={CheckCircle2}
            variant="completed"
            reduceMotion={prefersReducedMotion}
          />
          <StatsCard
            title="Cancelados"
            value={dashboardMetrics.cancelled}
            detail="Pedidos cancelados"
            icon={XCircle}
            variant="cancelled"
            reduceMotion={prefersReducedMotion}
          />
        </motion.div>

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

      <section className="admin-password-card" aria-labelledby="admin-password-title">
        <h2 id="admin-password-title">Cambiar contraseña</h2>
        <p>La contraseña debe tener entre 12 y 128 caracteres. Al cambiarla, se cerrarán las sesiones activas.</p>
        <form className="admin-password-form" onSubmit={handlePasswordChange}>
          <label>
            Contraseña actual
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Confirmar nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="admin-secondary-button" disabled={loading}>
            {loading ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </form>
      </section>

      <CatalogAdminPanel />

      <section className="admin-audit-card" aria-labelledby="admin-audit-title">
        <div className="admin-orders-heading">
          <div>
            <h2 id="admin-audit-title">Registro de auditoría</h2>
            <p>Últimas acciones administrativas sobre pedidos.</p>
          </div>
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => loadAudit().catch((requestError) => setError(requestError.message))}
            disabled={auditLoading}
          >
            {auditLoading ? "Actualizando..." : "Actualizar registro"}
          </button>
        </div>
        {auditEntries.length === 0 ? (
          <p className="admin-empty">
            {auditLoading ? "Cargando registro..." : "Todavía no hay acciones registradas."}
          </p>
        ) : (
          <ul className="admin-audit-list">
            {auditEntries.map((entry) => {
              let details;
              try {
                details = entry.details ? JSON.parse(entry.details) : null;
              } catch {
                details = null;
              }
              return (
                <li key={entry.id}>
                  <strong>{entry.actor}</strong>
                  <span>
                    {entry.action === "order.status_changed"
                      ? ` cambió el pedido ${entry.entity_id}: ${details?.from ?? "?"} → ${details?.to ?? "?"}`
                      : ` eliminó el pedido ${entry.entity_id}`}
                  </span>
                  <time dateTime={entry.created_at}>
                    {new Intl.DateTimeFormat("es-CO", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(entry.created_at))}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="admin-orders admin-orders-section">
        <div className="admin-orders-heading">
          <div>
            <h2>Solicitudes recibidas</h2>
            <p>
              {pagination.total === 0
                ? "0 pedidos"
                : `${(pagination.page - 1) * pagination.limit + 1}–${Math.min(
                  pagination.page * pagination.limit,
                  pagination.total,
                )} de ${pagination.total} pedidos`}
            </p>
          </div>
          <div className="admin-order-tools">
            <label htmlFor="admin-order-status-filter">Filtrar por estado</label>
            <select
              id="admin-order-status-filter"
              value={orderStatusFilter}
              onChange={changeStatusFilter}
            >
              <option value="Todos">Todos</option>
              {orderStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <button
              type="button"
              className="admin-secondary-button admin-refresh-button"
              onClick={() => loadOrders(page, orderStatusFilter)
                .catch((requestError) => setError(requestError.message))}
              disabled={loadingOrders}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {loadingOrders ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>

        {orders.length === 0 ? (
          <p className="admin-empty">
            {pagination.total === 0 && orderStatusFilter === "Todos"
              ? "Todavía no hay pedidos."
              : "No hay pedidos con el estado seleccionado."}
          </p>
        ) : (
          <div className="admin-order-list">
            {orders.map((order) => (
              <article className="admin-order-card" key={order.id}>
                <header className="admin-order-topline">
                  <div className="admin-order-customer">
                    <span className="admin-order-avatar" aria-hidden="true">
                      <UserRound size={20} />
                    </span>
                    <div className="admin-order-customer-copy">
                      <h3>{order.realName}</h3>
                      <p>
                        Nickname: <strong>{order.gameNickname}</strong>
                        <span> · </span>
                        {order.paymentMethod}
                      </p>
                      {order.customerEmail && (
                        <p className="admin-order-email">
                          Correo para avisos: {order.customerEmail}
                        </p>
                      )}
                    </div>
                  </div>
                  <time className="admin-order-date" dateTime={order.createdAt}>
                    {new Intl.DateTimeFormat("es-CO", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(order.createdAt))}
                  </time>
                </header>
                <ul className="admin-order-items-grid">
                  {order.items.map((item, index) => (
                    <li
                      className="admin-order-item"
                      key={`${item.name}-${item.category}-${index}`}
                    >
                      <span className="admin-order-item-icon" aria-hidden="true">
                        <Package size={18} />
                      </span>
                      <span className="admin-order-item-copy">
                        <strong>{item.name}</strong>
                        <small>{item.category} · Cantidad: {item.quantity ?? 1}</small>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="admin-order-total">
                  Total:{" "}
                  {order.totalAmount === null || order.totalAmount === undefined
                    ? "Pendiente por cotizar"
                    : order.currency === "COP"
                      ? `$${new Intl.NumberFormat("es-CO").format(order.totalAmount)} COP`
                      : `${new Intl.NumberFormat("es-CO").format(order.totalAmount)} platinos`}
                </p>
                {order.notification && (
                  <div
                    className={`admin-email-notification ${order.notification.status}`}
                    role="status"
                  >
                    <span>
                      Aviso por correo:{" "}
                      {order.notification.status === "sent"
                        ? "enviado"
                        : order.notification.status === "failed"
                          ? "falló"
                          : "pendiente"}
                    </span>
                    {order.notification.status !== "sent" && (
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={() => retryNotification(order.notification.id)}
                        disabled={retryingNotificationId === order.notification.id}
                      >
                        {retryingNotificationId === order.notification.id
                          ? "Reintentando..."
                          : "Reintentar aviso"}
                      </button>
                    )}
                  </div>
                )}
                <footer className="admin-order-footer">
                  <label className="admin-status-label">
                    <span>Estado del pedido</span>
                    <span className="admin-status-control">
                      <span
                        className={`admin-status-dot ${orderStatusClasses[order.status]}`}
                        aria-hidden="true"
                      />
                      <select
                        value={order.status}
                        onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                        aria-label={`Estado del pedido de ${order.realName}`}
                      >
                        {orderStatuses.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <div className="admin-order-actions">
                    <span className="admin-order-actions-label">Acciones</span>
                    <button
                      type="button"
                      className="admin-secondary-button admin-delete-button"
                      onClick={() => deleteOrder(order.id)}
                      disabled={deletingOrderId === order.id}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      {deletingOrderId === order.id ? "Eliminando..." : "Eliminar pedido"}
                    </button>
                  </div>
                </footer>
              </article>
            ))}
          </div>
        )}

        {pagination.totalPages > 1 && (
          <nav className="admin-pagination" aria-label="Paginación de pedidos">
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => changePage(pagination.page - 1)}
              disabled={loadingOrders || pagination.page <= 1}
            >
              Anterior
            </button>
            <span>Página {pagination.page} de {pagination.totalPages}</span>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => changePage(pagination.page + 1)}
              disabled={loadingOrders || pagination.page >= pagination.totalPages}
            >
              Siguiente
            </button>
          </nav>
        )}
      </section>
    </motion.main>
  );
}



export default AdminPage;
