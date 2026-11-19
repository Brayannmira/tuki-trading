import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check } from "lucide-react";
import { useState } from "react";
import CatalogProductHistory from "@/features/admin/catalog/CatalogProductHistory.jsx";
import { availabilityOptions, getInventoryStatus } from "@/features/admin/catalog/catalogUtils.js";

export default function CatalogProductEditor({
  product,
  savedProduct,
  onSave,
  onReload,
  onDirtyChange,
  saveState,
  hasUnsavedChanges,
  readOnly,
  importing,
  canReadAudit,
  expanded,
  onToggle,
  reduceMotion,
}) {
  const [priceCop, setPriceCop] = useState(savedProduct?.priceCop ?? "");
  const [pricePlatinum, setPricePlatinum] = useState(savedProduct?.pricePlatinum ?? "");
  const [stockQuantity, setStockQuantity] = useState(savedProduct?.stockQuantity ?? "");
  const [availability, setAvailability] = useState(
    savedProduct?.availability ?? "Por confirmar",
  );
  const originalValues = {
    priceCop: savedProduct?.priceCop ?? "",
    pricePlatinum: savedProduct?.pricePlatinum ?? "",
    stockQuantity: savedProduct?.stockQuantity ?? "",
    availability: savedProduct?.availability ?? "Por confirmar",
  };
  const currentValues = { priceCop, pricePlatinum, stockQuantity, availability };

  const updateField = (field, value, setValue) => {
    const nextValues = { ...currentValues, [field]: value };
    const isDirty = Object.keys(originalValues).some((key) =>
      String(nextValues[key] ?? "") !== String(originalValues[key] ?? ""));
    setValue(value);
    onDirtyChange(product.id, isDirty);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (
      readOnly ||
      importing ||
      saveState === "saving" ||
      saveState === "reloading" ||
      saveState === "conflict"
    ) return;
    onSave(product, {
      priceCop: priceCop === "" ? null : Number(priceCop),
      pricePlatinum: pricePlatinum === "" ? null : Number(pricePlatinum),
      stockQuantity: stockQuantity === "" ? null : Number(stockQuantity),
      availability,
    });
  };

  const discardDraft = () => {
    setPriceCop(originalValues.priceCop);
    setPricePlatinum(originalValues.pricePlatinum);
    setStockQuantity(originalValues.stockQuantity);
    setAvailability(originalValues.availability);
    onDirtyChange(product.id, false);
  };

  const inventoryStatus = getInventoryStatus(savedProduct);
  const formId = `admin-catalog-form-${encodeURIComponent(product.id)}`;

  return (
    <motion.article
      layout={!reduceMotion}
      className="admin-catalog-product"
      data-expanded={expanded}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
    >
      <button
        type="button"
        className="admin-catalog-product-toggle"
        aria-expanded={expanded}
        aria-controls={formId}
        onClick={onToggle}
        disabled={saveState === "saving" || saveState === "reloading"}
      >
        <span>
          <strong>{product.name}</strong>
          <small>{product.category} · {product.type}</small>
        </span>
        <span className="admin-catalog-summary-meta">
          {product.rarity && <small>{product.rarity}</small>}
          <span className={`admin-catalog-stock-badge ${inventoryStatus.kind}`}>
            {inventoryStatus.label}
          </span>
          <small>
            Existencias: {savedProduct?.stockQuantity ?? "Sin confirmar"}
          </small>
          <small>
            Popularidad: {new Intl.NumberFormat("es-CO").format(savedProduct?.popularity ?? 0)}
          </small>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.form
            id={formId}
            key="editor"
            className="admin-catalog-product-form"
            onSubmit={handleSubmit}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <label>
              Precio COP
              <input
                type="number"
                min="0"
                max="1000000000"
                step="1"
                value={priceCop}
                onChange={(event) => updateField("priceCop", event.target.value, setPriceCop)}
                placeholder="Por cotizar"
                disabled={readOnly || importing || ["saving", "reloading", "conflict"].includes(saveState)}
              />
            </label>
            <label>
              Precio en platino
              <input
                type="number"
                min="0"
                max="1000000000"
                step="1"
                value={pricePlatinum}
                onChange={(event) => updateField("pricePlatinum", event.target.value, setPricePlatinum)}
                placeholder="Por cotizar"
                disabled={readOnly || importing || ["saving", "reloading", "conflict"].includes(saveState)}
              />
            </label>
            <label>
              Existencias
              <input
                type="number"
                min="0"
                max="1000000"
                step="1"
                value={stockQuantity}
                onChange={(event) => updateField("stockQuantity", event.target.value, setStockQuantity)}
                placeholder="Sin confirmar"
                disabled={readOnly || importing || ["saving", "reloading", "conflict"].includes(saveState)}
              />
            </label>
            <label>
              Disponibilidad
              <select
                value={availability}
                onChange={(event) => updateField("availability", event.target.value, setAvailability)}
                disabled={readOnly || importing || ["saving", "reloading", "conflict"].includes(saveState)}
              >
                {availabilityOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            {!readOnly && (
              <div className="admin-catalog-editor-actions">
                <div className="admin-catalog-save-row">
                  <button
                    type="submit"
                    className={`admin-secondary-button admin-catalog-save-button ${saveState ?? ""}`}
                    disabled={importing || ["saving", "reloading", "conflict"].includes(saveState)}
                  >
                    {saveState === "saving" && "Guardando..."}
                    {saveState === "reloading" && "Cargando versión..."}
                    {saveState === "saved" && <><Check size={15} aria-hidden="true" /> Guardado</>}
                    {saveState === "error" && <><AlertCircle size={15} aria-hidden="true" /> Reintentar</>}
                    {saveState === "conflict" && <><AlertCircle size={15} aria-hidden="true" /> Conflicto</>}
                    {!saveState && "Guardar artículo"}
                  </button>
                  {saveState === "conflict" && (
                    <button
                      type="button"
                      className="admin-secondary-button"
                      onClick={() => onReload(product.id)}
                      disabled={importing || saveState === "reloading"}
                    >
                      Descartar cambios y cargar la versión actual
                    </button>
                  )}
                  {hasUnsavedChanges && (
                    <>
                      <span className="admin-catalog-dirty-status" role="status">
                        Cambios sin guardar.
                      </span>
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={discardDraft}
                        disabled={importing || saveState === "saving"}
                      >
                        Descartar cambios
                      </button>
                    </>
                  )}
                  {saveState === "saved" && (
                    <span className="admin-catalog-save-status" role="status">Cambios guardados.</span>
                  )}
                </div>
                {canReadAudit && <CatalogProductHistory product={product} />}
              </div>
            )}
            {readOnly && canReadAudit && (
              <div className="admin-catalog-editor-actions">
                <CatalogProductHistory product={product} />
              </div>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
