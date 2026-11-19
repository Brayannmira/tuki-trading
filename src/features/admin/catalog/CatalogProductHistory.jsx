import { useState } from "react";
import {
  auditPageSize,
  formatAuditSummary,
  readJsonResponse,
} from "@/features/admin/catalog/catalogUtils.js";

export default function CatalogProductHistory({ product }) {
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [history, setHistory] = useState(null);

  const loadHistory = async (requestedPage = 1) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const query = new URLSearchParams({
        page: String(requestedPage),
        limit: String(auditPageSize),
        category: "catalog",
        entityId: product.id,
      });
      const response = await fetch(`/api/admin/audit?${query}`, {
        credentials: "same-origin",
      });
      const result = await readJsonResponse(response);
      if (!Array.isArray(result.data) || !result.pagination) {
        throw new Error("El servidor devolvió un historial de artículo no válido.");
      }
      const entries = result.data.map((entry) => ({
        ...entry,
        summary: formatAuditSummary(entry),
      }));
      setHistory({ ...result, data: entries });
    } catch (requestError) {
      setHistoryError(requestError.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    if (showHistory) setShowHistory(false);
    else {
      setShowHistory(true);
      loadHistory(1);
    }
  };

  return (
    <>
      <button
        type="button"
        className="admin-secondary-button admin-catalog-history-toggle"
        onClick={toggleHistory}
      >
        {showHistory ? "Ocultar historial" : "Ver historial"}
      </button>
      {showHistory && (
        <section className="admin-catalog-history" aria-label={`Historial de ${product.name}`}>
          <div className="admin-catalog-history-heading">
            <h3>Historial de cambios</h3>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => loadHistory(history?.pagination.page ?? 1)}
              disabled={historyLoading}
            >
              Actualizar
            </button>
          </div>
          {historyError && <p className="admin-error" role="alert">{historyError}</p>}
          {historyLoading && <p role="status">Cargando historial...</p>}
          {!historyLoading && history?.data.length === 0 && (
            <p>No hay cambios registrados para este artículo.</p>
          )}
          {!historyLoading && history?.data.length > 0 && (
            <ul className="admin-catalog-history-list">
              {history.data.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{entry.actor}</strong>
                    <span>{entry.summary}</span>
                  </div>
                  <time dateTime={entry.created_at}>
                    {new Intl.DateTimeFormat("es-CO", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(entry.created_at))}
                  </time>
                </li>
              ))}
            </ul>
          )}
          {history && history.pagination.totalPages > 1 && (
            <nav className="admin-pagination" aria-label={`Paginación del historial de ${product.name}`}>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => loadHistory(history.pagination.page - 1)}
                disabled={historyLoading || history.pagination.page <= 1}
              >
                Anterior
              </button>
              <span>Página {history.pagination.page} de {history.pagination.totalPages}</span>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => loadHistory(history.pagination.page + 1)}
                disabled={historyLoading || history.pagination.page >= history.pagination.totalPages}
              >
                Siguiente
              </button>
            </nav>
          )}
        </section>
      )}
    </>
  );
}
