import { useCallback, useEffect, useState } from "react";

const roles = [
  { value: "owner", label: "Propietario" },
  { value: "orders", label: "Gestión de pedidos" },
  { value: "catalog", label: "Catálogo e inventario" },
  { value: "viewer", label: "Solo lectura" },
];

async function readJsonResponse(response) {
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `No se pudo completar la solicitud (HTTP ${response.status}).`);
  }
  return result;
}

export default function AdminUsersPanel({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("orders");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/admin/users", { credentials: "same-origin" });
    const result = await readJsonResponse(response);
    setUsers(result);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/users", { credentials: "same-origin" })
      .then(readJsonResponse)
      .then((result) => {
        if (active) setUsers(result);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const createUser = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      await readJsonResponse(response);
      setUsername("");
      setPassword("");
      setRole("orders");
      setNotice("Administrador creado. Comparte la contraseña inicial por un canal seguro; deberá cambiarla y configurar su app autenticadora al ingresar.");
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (user, nextRole) => {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/role`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      await readJsonResponse(response);
      setNotice(`Se actualizó el rol de ${user.username}. Sus sesiones anteriores quedaron revocadas.`);
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const resetMfa = async (user) => {
    if (!window.confirm(`¿Restablecer el segundo factor de ${user.username}? Tendrá que configurarlo de nuevo.`)) {
      return;
    }
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/mfa-reset`, {
        method: "POST",
        credentials: "same-origin",
      });
      await readJsonResponse(response);
      setNotice(`Segundo factor restablecido para ${user.username}.`);
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const deactivateUser = async (user) => {
    if (!window.confirm(`¿Desactivar la cuenta de ${user.username}? Se cerrarán sus sesiones activas.`)) {
      return;
    }
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      await readJsonResponse(response);
      setNotice(`Cuenta de ${user.username} desactivada.`);
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <section className="admin-users-card" aria-labelledby="admin-users-title">
      <header className="admin-orders-heading">
        <div>
          <h2 id="admin-users-title">Administradores y permisos</h2>
          <p>Las cuentas nuevas deben cambiar su contraseña y registrar una app autenticadora antes de operar.</p>
        </div>
      </header>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <form className="admin-user-create-form" onSubmit={createUser}>
        <label>
          Usuario
          <input
            type="text"
            autoComplete="off"
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9._-]+"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          Contraseña inicial
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label>
          Rol
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            {roles.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="admin-secondary-button" disabled={saving}>
          {saving ? "Creando..." : "Crear administrador"}
        </button>
      </form>

      {loading ? (
        <p className="admin-empty">Cargando administradores...</p>
      ) : (
        <ul className="admin-users-list">
          {users.map((user) => (
            <li className="admin-user-row" key={user.id}>
              <div className="admin-user-info">
                <strong>{user.username}{user.id === currentUserId ? " (tú)" : ""}</strong>
                <span>
                  {user.mfa_enabled ? "Segundo factor activo" : "Segundo factor pendiente"}
                  {user.must_change_password ? " · Debe cambiar la contraseña" : ""}
                  {!user.active ? " · Desactivado" : ""}
                </span>
              </div>
              <label>
                Rol
                <select
                  aria-label={`Rol de ${user.username}`}
                  value={user.role}
                  disabled={!user.active || user.id === currentUserId}
                  onChange={(event) => changeRole(user, event.target.value)}
                >
                  {roles.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              {user.active && user.id !== currentUserId && (
                <div className="admin-user-actions">
                  <button
                    type="button"
                    className="admin-secondary-button"
                    onClick={() => resetMfa(user)}
                  >
                    Restablecer 2FA
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-button admin-delete-button"
                    onClick={() => deactivateUser(user)}
                  >
                    Desactivar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
