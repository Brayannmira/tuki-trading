import { AnimatePresence, motion } from "framer-motion";
import {
  formatArticleCount,
  formatCatalogValue,
  hasCatalogProductChanges,
} from "@/features/admin/catalog/catalogUtils.js";

export default function CatalogImportPreview({
  pendingImport,
  savedProducts,
  previewChanges,
  reduceMotion,
  readOnly,
  importing,
  onCancel,
  onConfirm,
}) {
  return (
    <AnimatePresence initial={false}>
      {pendingImport && (
        <motion.section
          key="csv-preview"
          className="admin-catalog-import-preview"
          aria-labelledby="admin-catalog-preview-title"
          initial={reduceMotion ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          <div className="admin-catalog-preview-heading">
            <div>
              <h3 id="admin-catalog-preview-title">Vista previa del CSV</h3>
              <p>
                {pendingImport.fileName}: {formatArticleCount(pendingImport.products.length)}
                ({previewChanges.newCount} nuevos, {previewChanges.updatedCount} con cambios,
                {" "}{previewChanges.unchangedCount} sin cambios).
                Revisa los datos antes de aplicarlos.
              </p>
            </div>
            {!readOnly && (
              <div className="admin-catalog-preview-actions">
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={onCancel}
                  disabled={importing}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={onConfirm}
                  disabled={importing}
                >
                  {importing ? "Aplicando..." : `Aplicar ${formatArticleCount(pendingImport.products.length)}`}
                </button>
              </div>
            )}
          </div>
          <div className="admin-catalog-preview-table-wrap">
            <table className="admin-catalog-preview-table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>COP (actual → nuevo)</th>
                  <th>Platino (actual → nuevo)</th>
                  <th>Existencias (actual → nuevas)</th>
                  <th>Disponibilidad (actual → nueva)</th>
                </tr>
              </thead>
              <tbody>
                {pendingImport.products.slice(0, 8).map((product) => (
                  <tr key={product.id} className={!savedProducts[product.id] ? "new" : ""}>
                    {(() => {
                      const existing = savedProducts[product.id];
                      const changed = existing && hasCatalogProductChanges(existing, product);
                      const renderDifference = (field) => {
                        const nextValue = formatCatalogValue(field, product[field]);
                        if (!existing) return <strong>{nextValue}</strong>;
                        const currentValue = formatCatalogValue(field, existing[field]);
                        if (currentValue === nextValue) return <span>{nextValue}</span>;
                        return (
                          <span className="admin-catalog-value-diff">
                            <del>{currentValue}</del>
                            <span aria-hidden="true">→</span>
                            <strong>{nextValue}</strong>
                          </span>
                        );
                      };
                      return (
                        <>
                          <td>
                            {existing?.name && existing.name !== product.name ? (
                              <span className="admin-catalog-value-diff">
                                <del>{existing.name}</del>
                                <span aria-hidden="true">→</span>
                                <strong>{product.name}</strong>
                              </span>
                            ) : product.name}
                            {existing?.category && existing.category !== product.category && (
                              <small>
                                Categoría: {existing.category} → {product.category}
                              </small>
                            )}
                            <small>
                              {existing ? (changed ? "Cambiará" : "Sin cambios") : "Nuevo artículo"}
                            </small>
                          </td>
                          <td>{renderDifference("priceCop")}</td>
                          <td>{renderDifference("pricePlatinum")}</td>
                          <td>{renderDifference("stockQuantity")}</td>
                          <td>{renderDifference("availability")}</td>
                        </>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pendingImport.products.length > 8 && (
            <p className="admin-catalog-preview-more">
              Se muestran 8 de {pendingImport.products.length} artículos.
            </p>
          )}
          <p className="admin-catalog-preview-note">
            Al confirmar, todos los artículos se guardan en una sola transacción: si algo falla, no se aplica ninguno.
          </p>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
