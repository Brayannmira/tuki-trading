import warframes from "@/features/catalog/data/warframe/Warframes.js";
import primarias from "@/features/catalog/data/warframe/Primarias.js";
import secundarias from "@/features/catalog/data/warframe/secundarias.js";
import mele from "@/features/catalog/data/warframe/mele.js";

export const catalogGroups = [
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

export const availabilityOptions = [
  "Por confirmar",
  "Disponible",
  "En Bóveda",
  "Oferta Especial",
  "Agotado",
];
export const productsPerPage = 30;
export const maxCsvFileSize = 512 * 1024;
export const auditPageSize = 10;

const maxCatalogImportProducts = 1000;
const auditFieldLabels = {
  priceCop: "Precio COP",
  pricePlatinum: "Precio platino",
  stockQuantity: "Existencias",
  availability: "Disponibilidad",
};

function getPartDisplayName(itemName, partName) {
  return normalizeText(partName).includes(normalizeText(itemName))
    ? partName
    : `${partName} de ${itemName}`;
}

export const catalogProducts = catalogGroups.flatMap((group) =>
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

const catalogProductsById = new Map(catalogProducts.map((product) => [product.id, product]));

export function normalizeText(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function formatArticleCount(count) {
  return `${count} artículo${count === 1 ? "" : "s"}`;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function createCatalogCsvTemplate() {
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

function parseOptionalInteger(value, rowNumber, fieldName, maximum) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  const parsedValue = Number(trimmedValue);
  if (
    !/^\d+$/.test(trimmedValue) ||
    !Number.isSafeInteger(parsedValue) ||
    parsedValue > maximum
  ) {
    throw new Error(`El valor de ${fieldName} no es un entero válido (fila ${rowNumber}).`);
  }
  return parsedValue;
}

export function parseCatalogCsv(content) {
  const rows = parseCsvRows(content.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("El CSV debe incluir encabezados y al menos un artículo.");
  if (rows.length - 1 > maxCatalogImportProducts) {
    throw new Error(`El CSV no puede superar ${maxCatalogImportProducts} artículos.`);
  }

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

  const products = [];
  const errors = [];
  const firstRowById = new Map();
  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const cell = (field) => cells[columns[field]] ?? "";
    try {
      const id = cell("id").trim();
      const name = cell("name").trim();
      const category = cell("category").trim();
      if (!id || !name || !category) {
        throw new Error(`Faltan identificador, nombre o categoría (fila ${rowNumber}).`);
      }
      if (id.length > 180 || name.length > 120 || category.length > 80) {
        throw new Error(`Un campo excede su longitud máxima (fila ${rowNumber}).`);
      }
      const catalogProduct = catalogProductsById.get(id);
      if (!catalogProduct) {
        throw new Error(`El ID "${id}" no pertenece al catálogo de la tienda (fila ${rowNumber}).`);
      }
      if (catalogProduct.name !== name || catalogProduct.category !== category) {
        throw new Error(`El nombre o categoría no coincide con el ID del catálogo (fila ${rowNumber}).`);
      }
      const availability = cell("availability").trim() || "Por confirmar";
      if (!availabilityOptions.includes(availability)) {
        throw new Error(`La disponibilidad no es válida (fila ${rowNumber}).`);
      }
      const product = {
        id,
        name,
        category,
        priceCop: parseOptionalInteger(cell("priceCop"), rowNumber, "priceCop", 1_000_000_000),
        pricePlatinum: parseOptionalInteger(
          cell("pricePlatinum"),
          rowNumber,
          "pricePlatinum",
          1_000_000_000,
        ),
        stockQuantity: parseOptionalInteger(
          cell("stockQuantity"),
          rowNumber,
          "stockQuantity",
          1_000_000,
        ),
        availability,
      };
      const firstRow = firstRowById.get(id);
      if (firstRow !== undefined) {
        errors.push(`El identificador ${id} está duplicado (filas ${firstRow} y ${rowNumber}).`);
      } else {
        firstRowById.set(id, rowNumber);
      }
      products.push(product);
    } catch (error) {
      errors.push(error.message);
    }
  });
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
  return products;
}

export async function readJsonResponse(response) {
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      result.error || `No se pudo completar la solicitud (HTTP ${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return result;
}

export function getStockFilterKind(savedProduct) {
  const stockQuantity = savedProduct?.stockQuantity;
  if (savedProduct?.availability === "Agotado" || stockQuantity === 0) {
    return "out";
  }
  if (Number.isSafeInteger(stockQuantity) && stockQuantity <= 3) {
    return "low";
  }
  if (stockQuantity === null || stockQuantity === undefined) {
    return "unconfirmed";
  }
  return "normal";
}

export function getInventoryStatus(savedProduct) {
  const stockKind = getStockFilterKind(savedProduct);
  if (stockKind === "out") return { kind: "out", label: "Agotado" };
  if (stockKind === "low") return { kind: "low", label: "Pocas existencias" };
  if (stockKind === "unconfirmed") {
    return { kind: "unconfirmed", label: "Existencias sin confirmar" };
  }
  const availability = savedProduct?.availability ?? "Por confirmar";
  return {
    kind: availability === "Por confirmar" ? "unconfirmed" : "normal",
    label: availability,
  };
}

export function formatCatalogValue(field, value) {
  if (value === null || value === undefined || value === "") {
    if (field === "stockQuantity") return "Sin confirmar";
    if (field === "priceCop" || field === "pricePlatinum") return "Por cotizar";
    return "Sin definir";
  }
  if (field === "priceCop" || field === "pricePlatinum") {
    return new Intl.NumberFormat("es-CO").format(value);
  }
  return String(value);
}

export function hasCatalogProductChanges(existing, product) {
  return !existing ||
    existing.name !== product.name ||
    existing.category !== product.category ||
    existing.priceCop !== product.priceCop ||
    existing.pricePlatinum !== product.pricePlatinum ||
    existing.stockQuantity !== product.stockQuantity ||
    existing.availability !== product.availability;
}

export function formatAuditSummary(entry) {
  let details;
  try {
    details = entry.details ? JSON.parse(entry.details) : null;
  } catch {
    throw new Error(`No se pudo leer el detalle del registro ${entry.id}.`);
  }

  const changes = Array.isArray(details?.changes) ? details.changes : [];
  return changes.map((change) => {
    const field = auditFieldLabels[change.field] ?? change.field;
    return `${field}: ${formatCatalogValue(change.field, change.before)} → ${formatCatalogValue(change.field, change.after)}`;
  }).join("; ") || "Cambio registrado sin detalle de valores.";
}
