import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import CatalogImportPreview from "@/features/admin/catalog/CatalogImportPreview.jsx";
import CatalogProductEditor from "@/features/admin/catalog/CatalogProductEditor.jsx";
import {
  catalogGroups,
  catalogProducts,
  createCatalogCsvTemplate,
  formatArticleCount,
  getStockFilterKind,
  hasCatalogProductChanges,
  maxCsvFileSize,
  normalizeText,
  parseCatalogCsv,
  productsPerPage,
  readJsonResponse,
} from "@/features/admin/catalog/catalogUtils.js";

export default function CatalogAdminPanel({ readOnly = false, canReadAudit = false }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [savedProducts, setSavedProducts] = useState({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [inventoryFilter, setInventoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("catalog");
  const [page, setPage] = useState(1);
  const [expandedProductId, setExpandedProductId] = useState("");
  const [loading, setLoading] = useState(true);
  const [productSaveStates, setProductSaveStates] = useState({});
  const [dirtyProductIds, setDirtyProductIds] = useState({});
  const [draftResetVersions, setDraftResetVersions] = useState({});
  const [importing, setImporting] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const [pendingImport, setPendingImport] = useState(null);
  const [catalogLoadError, setCatalogLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/catalog", { credentials: "same-origin" })
      .then(readJsonResponse)
      .then((products) => {
        if (!Array.isArray(products)) {
          throw new Error("El servidor devolvió datos de inventario no válidos.");
        }
        if (active) {
          setSavedProducts(Object.fromEntries(products.map((product) => [product.id, product])));
          setCatalogLoadError("");
        }
      })
      .catch((requestError) => {
        if (active) {
          setCatalogLoadError(requestError.message);
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = normalizeText(search.trim());
    const products = catalogProducts.filter((product) => {
      const matchesCategory = category === "Todas" || product.category === category;
      const matchesSearch = !normalizedSearch ||
        normalizeText(`${product.name} ${product.category} ${product.type} ${product.rarity ?? ""}`)
          .includes(normalizedSearch);
      const savedProduct = savedProducts[product.id];
      const matchesInventory = inventoryFilter === "all" ||
        (inventoryFilter === "inStock"
          ? Number.isSafeInteger(savedProduct?.stockQuantity) &&
            savedProduct.stockQuantity > 0 &&
            savedProduct.availability !== "Agotado"
          : getStockFilterKind(savedProduct) === inventoryFilter);
      return matchesCategory && matchesSearch && matchesInventory;
    });
    if (sortBy !== "catalog") {
      products.sort((left, right) => {
        const leftSaved = savedProducts[left.id];
        const rightSaved = savedProducts[right.id];
        let comparison = 0;
        if (sortBy === "stock") {
          comparison = (leftSaved?.stockQuantity ?? Number.POSITIVE_INFINITY) -
            (rightSaved?.stockQuantity ?? Number.POSITIVE_INFINITY);
        } else if (sortBy === "popularity") {
          comparison = (rightSaved?.popularity ?? 0) - (leftSaved?.popularity ?? 0);
        } else if (sortBy === "updated") {
          comparison = (Date.parse(rightSaved?.updatedAt ?? "") || 0) -
            (Date.parse(leftSaved?.updatedAt ?? "") || 0);
        }
        return comparison || left.name.localeCompare(right.name, "es");
      });
    }
    return products;
  }, [category, inventoryFilter, savedProducts, search, sortBy]);

  const inventoryCounts = useMemo(() => {
    const counts = { all: catalogProducts.length, inStock: 0, low: 0, out: 0, unconfirmed: 0 };
    catalogProducts.forEach((product) => {
      const savedProduct = savedProducts[product.id];
      const status = getStockFilterKind(savedProduct);
      if (status !== "normal") counts[status] += 1;
      if (
        Number.isSafeInteger(savedProduct?.stockQuantity) &&
        savedProduct.stockQuantity > 0 &&
        savedProduct.availability !== "Agotado"
      ) counts.inStock += 1;
    });
    return counts;
  }, [savedProducts]);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
  const currentPage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage,
  );

  const updateProductDirtyState = (productId, isDirty) => {
    setDirtyProductIds((current) => {
      if (Boolean(current[productId]) === isDirty) return current;
      const next = { ...current };
      if (isDirty) next[productId] = true;
      else delete next[productId];
      return next;
    });
    if (isDirty) {
      setProductSaveStates((current) => {
        if (!current[productId]) return current;
        const next = { ...current };
        delete next[productId];
        return next;
      });
    }
  };
  const hasUnsavedEdits = Object.keys(dirtyProductIds).length > 0;

  const confirmDiscardEdits = () => {
    const dirtyIds = Object.keys(dirtyProductIds);
    if (dirtyIds.length === 0) return true;
    if (!window.confirm("Hay cambios sin guardar. ¿Descartarlos y continuar?")) return false;

    setDirtyProductIds({});
    setDraftResetVersions((current) => {
      const next = { ...current };
      dirtyIds.forEach((productId) => {
        next[productId] = (next[productId] ?? 0) + 1;
      });
      return next;
    });
    return true;
  };

  const toggleProduct = (productId) => {
    if (!confirmDiscardEdits()) return;
    setExpandedProductId((current) => current === productId ? "" : productId);
  };

  const saveProduct = async (product, values) => {
    if (readOnly || importing) return;
    setError("");
    setNotice("");
    setProductSaveStates((current) => ({ ...current, [product.id]: "saving" }));
    try {
      const response = await fetch(
        `/api/admin/catalog/${encodeURIComponent(product.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...product,
            ...values,
            expectedVersion: savedProducts[product.id]?.version ?? null,
          }),
        },
      );
      const savedProduct = await readJsonResponse(response);
      setSavedProducts((current) => ({
        ...current,
        [product.id]: { ...current[product.id], ...savedProduct },
      }));
      setProductSaveStates((current) => ({ ...current, [product.id]: "saved" }));
      setDirtyProductIds((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    } catch (requestError) {
      setError(requestError.message);
      setProductSaveStates((current) => ({
        ...current,
        [product.id]: requestError.status === 409 ? "conflict" : "error",
      }));
    }
  };

  const reloadProduct = async (productId) => {
    setProductSaveStates((current) => ({ ...current, [productId]: "reloading" }));
    try {
      const response = await fetch("/api/admin/catalog", { credentials: "same-origin" });
      const products = await readJsonResponse(response);
      if (!Array.isArray(products)) {
        throw new Error("El servidor devolvió datos de inventario no válidos.");
      }
      const currentProduct = products.find((entry) => entry.id === productId);
      setSavedProducts((current) => {
        const next = { ...current };
        if (currentProduct) next[productId] = currentProduct;
        else delete next[productId];
        return next;
      });
      setDirtyProductIds((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      setDraftResetVersions((current) => ({
        ...current,
        [productId]: (current[productId] ?? 0) + 1,
      }));
      setProductSaveStates((current) => {
        const next = { ...current };
        delete next[productId];
        return next;
      });
      setError("");
      setNotice("Se cargó la versión actual del artículo.");
    } catch (requestError) {
      setError(requestError.message);
      setProductSaveStates((current) => ({ ...current, [productId]: "conflict" }));
    }
  };

  const downloadTemplate = () => {
    const csv = createCatalogCsvTemplate();
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tuki-trading-catalogo-plantilla.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const prepareCsv = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (readOnly) return;
    setError("");
    setNotice("");
    if (file.size > maxCsvFileSize) {
      setPendingImport(null);
      setError("El CSV excede el límite de 512 KB.");
      input.value = "";
      return;
    }
    try {
      const products = parseCatalogCsv(await file.text());
      setPendingImport({ fileName: file.name, products });
    } catch (requestError) {
      setPendingImport(null);
      setError(requestError.message);
    } finally {
      input.value = "";
    }
  };

  const confirmImport = async () => {
    if (!pendingImport || readOnly || importing) return;
    if (!confirmDiscardEdits()) return;
    const { products } = pendingImport;
    setError("");
    setNotice("");
    setImporting(true);
    setImportCount(products.length);
    const productsToImport = products.map((product) => ({
      ...product,
      expectedVersion: savedProducts[product.id]?.version ?? null,
    }));
    try {
      const response = await fetch("/api/admin/catalog/import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: productsToImport }),
      });
      const result = await readJsonResponse(response);
      if (result.importedCount !== products.length) {
        throw new Error("El servidor no confirmó todos los artículos importados.");
      }
      const updatedAt = new Date().toISOString();
      setSavedProducts((current) => ({
        ...current,
        ...Object.fromEntries(products.map((product) => {
          const existing = current[product.id];
          return [
            product.id,
            {
              ...existing,
              ...product,
              popularity: existing?.popularity ?? 0,
              version: hasCatalogProductChanges(existing, product)
                ? (existing?.version ?? 0) + 1
                : existing?.version ?? 1,
              updatedAt: hasCatalogProductChanges(existing, product)
                ? updatedAt
                : existing?.updatedAt,
            },
          ];
        })),
      }));
      setProductSaveStates((current) => {
        const next = { ...current };
        products.forEach((product) => delete next[product.id]);
        return next;
      });
      setExpandedProductId("");
      setPendingImport(null);
      setNotice(products.length === 1
        ? "Se importó 1 artículo correctamente."
        : `Se importaron ${formatArticleCount(products.length)} correctamente.`);
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.status === 409) {
        try {
          const response = await fetch("/api/admin/catalog", { credentials: "same-origin" });
          const currentProducts = await readJsonResponse(response);
          if (!Array.isArray(currentProducts)) {
            setError(
              `${requestError.message} El servidor devolvió datos de inventario no válidos.`,
            );
          } else {
            setSavedProducts(Object.fromEntries(
              currentProducts.map((product) => [product.id, product]),
            ));
          }
        } catch (refreshError) {
          setError(`${requestError.message} ${refreshError.message}`);
        }
      }
    } finally {
      setImporting(false);
    }
  };

  const previewChanges = pendingImport
    ? pendingImport.products.reduce((changes, product) => {
      const existing = savedProducts[product.id];
      if (!existing) changes.newCount += 1;
      else if (hasCatalogProductChanges(existing, product)) changes.updatedCount += 1;
      else changes.unchangedCount += 1;
      return changes;
    }, { newCount: 0, updatedCount: 0, unchangedCount: 0 })
    : null;

  return (
    <section className="admin-catalog-section" aria-labelledby="admin-catalog-title">
      <header className="admin-catalog-heading">
        <div>
          <h2 id="admin-catalog-title">Catálogo e inventario</h2>
          <p>
            {readOnly
              ? "Consulta precios COP, platino, existencias y disponibilidad."
              : "Configura precios COP, platino, existencias y disponibilidad por artículo."}
          </p>
        </div>
        <span>{filteredProducts.length} de {catalogProducts.length} artículos</span>
      </header>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <div className="admin-catalog-filters">
        <label>
          Buscar artículo
          <input
            type="search"
            value={search}
            onChange={(event) => {
              if (!confirmDiscardEdits()) return;
              setSearch(event.target.value);
              setPage(1);
              setExpandedProductId("");
            }}
            placeholder="Nombre, tipo o rareza..."
          />
        </label>
        <label>
          Categoría
          <select
            value={category}
            onChange={(event) => {
              if (!confirmDiscardEdits()) return;
              setCategory(event.target.value);
              setPage(1);
              setExpandedProductId("");
            }}
          >
            <option value="Todas">Todas</option>
            {catalogGroups.map((group) => (
              <option key={group.id} value={group.label}>{group.label}</option>
            ))}
          </select>
        </label>
        <label>
          Ordenar por
          <select
            value={sortBy}
            onChange={(event) => {
              if (!confirmDiscardEdits()) return;
              setSortBy(event.target.value);
              setPage(1);
              setExpandedProductId("");
            }}
          >
            <option value="catalog">Orden del catálogo</option>
            <option value="stock">Menor existencia</option>
            <option value="popularity">Mayor popularidad</option>
            <option value="updated">Modificados recientemente</option>
          </select>
        </label>
        <button
          type="button"
          className="admin-secondary-button"
          onClick={downloadTemplate}
        >
          Descargar plantilla CSV
        </button>
        <label className="admin-catalog-import">
          Importar precios e inventario
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={prepareCsv}
            disabled={readOnly || importing || loading || Boolean(catalogLoadError)}
          />
        </label>
        {!readOnly && importing && (
          <span className="admin-catalog-import-progress" role="status">
            Aplicando {formatArticleCount(importCount)} en una sola operación...
          </span>
        )}
      </div>
      {hasUnsavedEdits && (
        <p className="admin-catalog-dirty-warning" role="status">
          Hay cambios sin guardar. Guarda o descarta el artículo antes de cambiar filtros o salir del editor.
        </p>
      )}
      <div className="admin-catalog-stock-filters" role="group" aria-label="Filtrar por existencias">
        {[
          ["all", "Todos"],
          ["inStock", "Con existencias"],
          ["low", "Pocas existencias"],
          ["out", "Agotados"],
          ["unconfirmed", "Sin confirmar"],
        ].map(([filter, label]) => (
          <button
            type="button"
            key={filter}
            className={inventoryFilter === filter ? "active" : ""}
            aria-pressed={inventoryFilter === filter}
            onClick={() => {
              if (!confirmDiscardEdits()) return;
              setInventoryFilter(filter);
              setPage(1);
              setExpandedProductId("");
            }}
          >
            {label} <span>{inventoryCounts[filter]}</span>
          </button>
        ))}
      </div>
      <CatalogImportPreview
        pendingImport={pendingImport}
        savedProducts={savedProducts}
        previewChanges={previewChanges}
        reduceMotion={reduceMotion}
        readOnly={readOnly}
        importing={importing}
        onCancel={() => setPendingImport(null)}
        onConfirm={confirmImport}
      />
      {loading ? (
        <div className="admin-catalog-skeletons" aria-label="Cargando inventario" aria-busy="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="admin-catalog-skeleton" key={index} />
          ))}
        </div>
      ) : (
        <>
          <motion.div className="admin-catalog-products" layout={!reduceMotion}>
            <AnimatePresence initial={false}>
              {visibleProducts.map((product) => (
                <CatalogProductEditor
                  key={`${product.id}:${savedProducts[product.id]?.version ?? 0}:${draftResetVersions[product.id] ?? 0}`}
                  product={product}
                  savedProduct={savedProducts[product.id]}
                  onSave={saveProduct}
                  onReload={reloadProduct}
                  onDirtyChange={updateProductDirtyState}
                  saveState={productSaveStates[product.id]}
                  hasUnsavedChanges={Boolean(dirtyProductIds[product.id])}
                  readOnly={readOnly}
                  importing={importing}
                  canReadAudit={canReadAudit}
                  expanded={expandedProductId === product.id}
                  onToggle={() => toggleProduct(product.id)}
                  reduceMotion={reduceMotion}
                />
              ))}
            </AnimatePresence>
            {visibleProducts.length === 0 && (
              <p className="admin-empty">No se encontraron artículos.</p>
            )}
          </motion.div>
          {totalPages > 1 && (
            <nav className="admin-pagination" aria-label="Paginación del catálogo">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => {
                  if (!confirmDiscardEdits()) return;
                  setPage((current) => Math.max(current - 1, 1));
                  setExpandedProductId("");
                }}
                disabled={currentPage === 1}
              >
                Anterior
              </button>
              <span>Página {currentPage} de {totalPages}</span>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => {
                  if (!confirmDiscardEdits()) return;
                  setPage((current) => Math.min(current + 1, totalPages));
                  setExpandedProductId("");
                }}
                disabled={currentPage === totalPages}
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
