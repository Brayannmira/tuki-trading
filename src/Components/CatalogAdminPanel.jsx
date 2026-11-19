import { useEffect, useMemo, useState } from "react";
import warframes from "../Services/Warframes.js";
import primarias from "../Services/Primarias.js";
import secundarias from "../Services/secundarias.js";
import mele from "../Services/mele.js";

const catalogGroups = [
  {
    id: "platino",
    label: "Platino",
    items: [
      { name: "100 platinos", type: "Paquete" },
      { name: "250 platinos", type: "Paquete" },
      { name: "600 platinos", type: "Paquete" },
    ],
  },
  { id: "warframes", label: "Warframes", items: warframes },
  { id: "primarias", label: "Armas Primarias", items: primarias },
  { id: "secundarias", label: "Armas Secundarias", items: secundarias },
  { id: "mele", label: "Armas Melé", items: mele },
];
const availabilityOptions = [
  "Por confirmar",
  "Disponible",
  "En Bóveda",
  "Oferta Especial",
  "Agotado",
];
const productsPerPage = 30;

function normalizeText(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getPartDisplayName(itemName, partName) {
  return normalizeText(partName).includes(normalizeText(itemName))
    ? partName
    : `${partName} de ${itemName}`;
}

const catalogProducts = catalogGroups.flatMap((group) =>
  group.items.flatMap((item) => [
    {
      id: `${group.id}:${item.name}`,
      name: item.name,
      category: group.label,
      type: item.type,
    },
    ...(item.parts ?? []).map((part) => {
      const name = getPartDisplayName(item.name, part.name);
      return {
        id: `${group.id}:${name}`,
        name,
        category: group.label,
        type: part.type,
        rarity: part.rarity,
      };
    }),
  ]),
);

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function createCatalogCsvTemplate() {
  const headers = [
    "id",
    "name",
    "category",
    "type",
    "rarity",
    "priceCop",
    "pricePlatinum",
    "stockQuantity",
    "availability",
  ];
  const rows = catalogProducts.map((product) => [
    product.id,
    product.name,
    product.category,
    product.type,
    product.rarity ?? "",
    "",
    "",
    "",
    "Por confirmar",
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
}

function parseCsvRows(content) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("El CSV contiene comillas sin cerrar.");
  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  return rows;
}

function parseOptionalInteger(value, rowNumber, fieldName) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  if (!/^\d+$/.test(trimmedValue) || !Number.isSafeInteger(Number(trimmedValue))) {
    throw new Error(`El valor de ${fieldName} no es un entero válido (fila ${rowNumber}).`);
  }
  return Number(trimmedValue);
}

function parseCatalogCsv(content) {
  const rows = parseCsvRows(content.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("El CSV debe incluir encabezados y al menos un artículo.");

  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const column = (name) => headers.indexOf(name.toLowerCase().replace(/[^a-z]/g, ""));
  const columns = {
    id: column("id"),
    name: column("name"),
    category: column("category"),
    priceCop: column("priceCop"),
    pricePlatinum: column("pricePlatinum"),
    stockQuantity: column("stockQuantity"),
    availability: column("availability"),
  };
  const missingColumns = Object.entries(columns)
    .filter(([name, index]) => index === -1 && name !== "availability")
    .map(([name]) => name);
  if (missingColumns.length > 0) {
    throw new Error(`Faltan columnas requeridas: ${missingColumns.join(", ")}.`);
  }

  const products = rows.slice(1).map((cells, index) => {
    const rowNumber = index + 2;
    const cell = (field) => cells[columns[field]] ?? "";
    const id = cell("id").trim();
    const name = cell("name").trim();
    const category = cell("category").trim();
    if (!id || !name || !category) {
      throw new Error(`Faltan identificador, nombre o categoría (fila ${rowNumber}).`);
    }
    return {
      id,
      name,
      category,
      priceCop: parseOptionalInteger(cell("priceCop"), rowNumber, "priceCop"),
      pricePlatinum: parseOptionalInteger(cell("pricePlatinum"), rowNumber, "pricePlatinum"),
      stockQuantity: parseOptionalInteger(cell("stockQuantity"), rowNumber, "stockQuantity"),
      availability: cell("availability").trim() || "Por confirmar",
    };
  });
  if (new Set(products.map((product) => product.id)).size !== products.length) {
    throw new Error("El CSV contiene identificadores duplicados.");
  }
  return products;
}

async function readJsonResponse(response) {
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `No se pudo completar la solicitud (HTTP ${response.status}).`);
  }
  return result;
}

function CatalogProductEditor({ product, savedProduct, onSave, saving }) {
  const [priceCop, setPriceCop] = useState(savedProduct?.priceCop ?? "");
  const [pricePlatinum, setPricePlatinum] = useState(savedProduct?.pricePlatinum ?? "");
  const [stockQuantity, setStockQuantity] = useState(savedProduct?.stockQuantity ?? "");
  const [availability, setAvailability] = useState(
    savedProduct?.availability ?? "Por confirmar",
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(product, {
      priceCop: priceCop === "" ? null : Number(priceCop),
      pricePlatinum: pricePlatinum === "" ? null : Number(pricePlatinum),
      stockQuantity: stockQuantity === "" ? null : Number(stockQuantity),
      availability,
    });
  };

  return (
    <details className="admin-catalog-product">
      <summary>
        <span>
          <strong>{product.name}</strong>
          <small>{product.category} · {product.type}</small>
        </span>
        <span className="admin-catalog-summary-meta">
          {product.rarity && <small>{product.rarity}</small>}
          <small>
            Popularidad: {new Intl.NumberFormat("es-CO").format(savedProduct?.popularity ?? 0)}
          </small>
        </span>
      </summary>
      <form className="admin-catalog-product-form" onSubmit={handleSubmit}>
        <label>
          Precio COP
          <input
            type="number"
            min="0"
            max="1000000000"
            step="1"
            value={priceCop}
            onChange={(event) => setPriceCop(event.target.value)}
            placeholder="Por cotizar"
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
            onChange={(event) => setPricePlatinum(event.target.value)}
            placeholder="Por cotizar"
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
            onChange={(event) => setStockQuantity(event.target.value)}
            placeholder="Sin confirmar"
          />
        </label>
        <label>
          Disponibilidad
          <select
            value={availability}
            onChange={(event) => setAvailability(event.target.value)}
          >
            {availabilityOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="admin-secondary-button" disabled={saving}>
          {saving ? "Guardando..." : "Guardar artículo"}
        </button>
      </form>
    </details>
  );
}

export default function CatalogAdminPanel() {
  const [savedProducts, setSavedProducts] = useState({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savingProductId, setSavingProductId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
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
        }
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

  const filteredProducts = useMemo(() => {
    const normalizedSearch = normalizeText(search.trim());
    return catalogProducts.filter((product) => {
      const matchesCategory = category === "Todas" || product.category === category;
      const matchesSearch = !normalizedSearch ||
        normalizeText(`${product.name} ${product.category} ${product.type} ${product.rarity ?? ""}`)
          .includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [category, search]);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
  const currentPage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage,
  );

  const saveProduct = async (product, values) => {
    setError("");
    setNotice("");
    setSavingProductId(product.id);
    try {
      const response = await fetch(
        `/api/admin/catalog/${encodeURIComponent(product.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...product, ...values }),
        },
      );
      const savedProduct = await readJsonResponse(response);
      setSavedProducts((current) => ({
        ...current,
        [product.id]: { ...current[product.id], ...savedProduct },
      }));
      setNotice(`${product.name}: inventario actualizado.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingProductId("");
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

  const importCsv = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setError("");
    setNotice("");
    setImporting(true);
    setImportProgress(0);
    let importedCount = 0;
    try {
      const products = parseCatalogCsv(await file.text());
      const batchSize = 25;
      for (let index = 0; index < products.length; index += batchSize) {
        const batch = products.slice(index, index + batchSize);
        const response = await fetch("/api/admin/catalog/import", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: batch }),
        });
        await readJsonResponse(response);
        importedCount += batch.length;
        setImportProgress(importedCount);
        setSavedProducts((current) => ({
          ...current,
          ...Object.fromEntries(batch.map((product) => [
            product.id,
            {
              ...current[product.id],
              ...product,
              popularity: current[product.id]?.popularity ?? 0,
              updatedAt: new Date().toISOString(),
            },
          ])),
        }));
      }
      setNotice(`Se importaron ${importedCount} artículos correctamente.`);
    } catch (requestError) {
      setError(
        importedCount > 0
          ? `Importación parcial: ${importedCount} artículos guardados. ${requestError.message}`
          : requestError.message,
      );
    } finally {
      setImporting(false);
      input.value = "";
    }
  };

  return (
    <section className="admin-catalog-section" aria-labelledby="admin-catalog-title">
      <header className="admin-catalog-heading">
        <div>
          <h2 id="admin-catalog-title">Catálogo e inventario</h2>
          <p>Configura precios COP, platino, existencias y disponibilidad por artículo.</p>
        </div>
        <span>{filteredProducts.length} artículos</span>
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
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Nombre, tipo o rareza..."
          />
        </label>
        <label>
          Categoría
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="Todas">Todas</option>
            {catalogGroups.map((group) => (
              <option key={group.id} value={group.label}>{group.label}</option>
            ))}
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
            onChange={importCsv}
            disabled={importing}
          />
        </label>
        {importing && <span className="admin-catalog-import-progress">Importados: {importProgress}</span>}
      </div>
      {loading ? (
        <p className="admin-empty">Cargando inventario...</p>
      ) : (
        <>
          <div className="admin-catalog-products">
            {visibleProducts.map((product) => (
              <CatalogProductEditor
                key={`${product.id}:${savedProducts[product.id]?.updatedAt ?? ""}`}
                product={product}
                savedProduct={savedProducts[product.id]}
                onSave={saveProduct}
                saving={savingProductId === product.id}
              />
            ))}
            {visibleProducts.length === 0 && (
              <p className="admin-empty">No se encontraron artículos.</p>
            )}
          </div>
          {totalPages > 1 && (
            <nav className="admin-pagination" aria-label="Paginación del catálogo">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </button>
              <span>Página {currentPage} de {totalPages}</span>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
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
