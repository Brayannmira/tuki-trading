import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CatalogAdminPanel from "@/features/admin/catalog/CatalogAdminPanel.jsx";

vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useReducedMotion: () => true };
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createCsvFile(csv) {
  const file = new File([csv], "inventario.csv", { type: "text/csv" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(csv) });
  return file;
}

describe("CatalogAdminPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("filters products by stock status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([
      {
        id: "platino:100 platinos",
        stockQuantity: 0,
        availability: "Agotado",
      },
      {
        id: "platino:250 platinos",
        stockQuantity: 2,
        availability: "Disponible",
      },
    ])));
    render(<CatalogAdminPanel />);

    const outOfStockFilter = await screen.findByRole("button", { name: "Agotados 1" });
    fireEvent.click(outOfStockFilter);

    expect(screen.getByText("100 platinos")).toBeInTheDocument();
    expect(screen.queryByText("250 platinos")).not.toBeInTheDocument();
    expect(outOfStockFilter).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the individual save result next to the edited product", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockImplementationOnce(async (_url, options) => jsonResponse({
        ...JSON.parse(options.body),
        version: 1,
        updatedAt: "2025-01-01T00:00:00.000Z",
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogAdminPanel />);

    fireEvent.click(await screen.findByRole("button", { name: /100 platinos/ }));
    fireEvent.change(await screen.findByLabelText("Precio COP"), {
      target: { value: "12000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar artículo" }));

    expect(await screen.findByRole("button", { name: /Guardado/ })).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).expectedVersion).toBeNull();
    expect(screen.getByText("Cambios guardados.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Cambios sin guardar.")).not.toBeInTheDocument();
    });
  });

  it("previews CSV data before applying it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValue(jsonResponse({ importedCount: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogAdminPanel />);

    const csv = [
      "id,name,category,priceCop,pricePlatinum,stockQuantity,availability",
      "platino:100 platinos,100 platinos,Platino,12000,100,5,Disponible",
    ].join("\n");
    fireEvent.change(screen.getByLabelText("Importar precios e inventario"), {
      target: { files: [createCsvFile(csv)] },
    });

    expect(await screen.findByRole("heading", { name: "Vista previa del CSV" }))
      .toBeInTheDocument();
    expect(screen.getByText("100 platinos", { selector: "td" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Aplicar 1 artículo" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/catalog/import");
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).products).toHaveLength(1);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).products[0].expectedVersion).toBeNull();
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se importó 1 artículo correctamente.",
    );
  });

  it("reports invalid CSV values without sending an import request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogAdminPanel />);

    const csv = [
      "id,name,category,priceCop,pricePlatinum,stockQuantity,availability",
      "platino:100 platinos,100 platinos,Platino,-1,100,5,Disponible",
    ].join("\n");
    fireEvent.change(screen.getByLabelText("Importar precios e inventario"), {
      target: { files: [createCsvFile(csv)] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "priceCop no es un entero válido (fila 2)",
    );
    expect(screen.queryByRole("heading", { name: "Vista previa del CSV" }))
      .not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows current and incoming values in the CSV comparison", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{
      id: "platino:100 platinos",
      name: "100 platinos",
      category: "Platino",
      priceCop: 5000,
      pricePlatinum: 100,
      stockQuantity: 4,
      availability: "Disponible",
    }])));
    render(<CatalogAdminPanel />);

    const csv = [
      "id,name,category,priceCop,pricePlatinum,stockQuantity,availability",
      "platino:100 platinos,100 platinos,Platino,12000,100,2,Disponible",
    ].join("\n");
    fireEvent.change(screen.getByLabelText("Importar precios e inventario"), {
      target: { files: [createCsvFile(csv)] },
    });

    const preview = await screen.findByRole("heading", { name: "Vista previa del CSV" });
    expect(preview.parentElement).toHaveTextContent("0 nuevos, 1 con cambios, 0 sin cambios");
    const row = screen.getByText("100 platinos", { selector: "td" }).closest("tr");
    expect(row).toHaveTextContent("Cambiará");
    expect(row).toHaveTextContent(/5\.000.*12\.000/);
    expect(row).toHaveTextContent(/4.*2/);
  });

  it("rejects CSV IDs that have no matching store item", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogAdminPanel />);

    const csv = [
      "id,name,category,priceCop,pricePlatinum,stockQuantity,availability",
      "unknown:item,Artículo desconocido,Platino,12000,100,5,Disponible",
    ].join("\n");
    fireEvent.change(screen.getByLabelText("Importar precios e inventario"), {
      target: { files: [createCsvFile(csv)] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      'El ID "unknown:item" no pertenece al catálogo de la tienda',
    );
    expect(screen.queryByRole("heading", { name: "Vista previa del CSV" }))
      .not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding unsaved product edits", async () => {
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    render(<CatalogAdminPanel />);

    const productToggle = await screen.findByRole("button", { name: /100 platinos/ });
    fireEvent.click(productToggle);
    const priceInput = await screen.findByLabelText("Precio COP");
    fireEvent.change(priceInput, { target: { value: "12000" } });
    expect(screen.getByText("Cambios sin guardar.")).toBeInTheDocument();

    fireEvent.click(productToggle);
    expect(confirmMock).toHaveBeenCalledWith(
      "Hay cambios sin guardar. ¿Descartarlos y continuar?",
    );
    expect(productToggle).toHaveAttribute("aria-expanded", "true");
    expect(priceInput).toHaveValue(12000);

    confirmMock.mockReturnValue(true);
    fireEvent.click(productToggle);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /100 platinos/ }))
        .toHaveAttribute("aria-expanded", "false");
    });
    expect(screen.queryByText("Cambios sin guardar.")).not.toBeInTheDocument();
  });

  it("sorts products by their current inventory", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([
      {
        id: "platino:100 platinos",
        stockQuantity: 5,
        availability: "Disponible",
      },
      {
        id: "platino:250 platinos",
        stockQuantity: 2,
        availability: "Disponible",
      },
    ])));
    render(<CatalogAdminPanel />);

    fireEvent.change(await screen.findByLabelText("Ordenar por"), {
      target: { value: "stock" },
    });

    const productToggles = await screen.findAllByRole("button", { name: /platinos/ });
    expect(productToggles[0]).toHaveTextContent("250 platinos");
  });

  it("loads the paginated audit history for an individual product", async () => {
    const fetchMock = vi.fn((url) => {
      if (url === "/api/admin/catalog") {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({
        data: [{
          id: 8,
          actor: "catalog-manager",
          action: "catalog.product_updated",
          entity_id: "platino:100 platinos",
          details: JSON.stringify({
            changes: [{ field: "priceCop", before: null, after: 12000 }],
          }),
          created_at: "2026-11-18T12:00:00.000Z",
        }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogAdminPanel canReadAudit />);

    fireEvent.click(await screen.findByRole("button", { name: /100 platinos/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver historial" }));

    expect(await screen.findByText("catalog-manager")).toBeInTheDocument();
    expect(screen.getByText("Precio COP: Por cotizar → 12.000")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toContain("entityId=platino%3A100+platinos");
  });

  it("preserves stale edits until the admin chooses to load the latest version", async () => {
    const savedProduct = {
      id: "platino:100 platinos",
      name: "100 platinos",
      category: "Platino",
      priceCop: 5000,
      pricePlatinum: 100,
      stockQuantity: 4,
      availability: "Disponible",
      version: 4,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([savedProduct]))
      .mockResolvedValueOnce(jsonResponse({
        error: "Otro administrador actualizó este artículo. Carga la versión actual antes de volver a guardar.",
      }, 409))
      .mockResolvedValueOnce(jsonResponse([{ ...savedProduct, priceCop: 9000, version: 5 }]));
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogAdminPanel />);

    fireEvent.click(await screen.findByRole("button", { name: /100 platinos/ }));
    fireEvent.change(await screen.findByLabelText("Precio COP"), {
      target: { value: "7000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar artículo" }));

    await screen.findByRole("button", { name: /Conflicto/ });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).expectedVersion).toBe(4);
    expect(screen.getByLabelText("Precio COP")).toHaveValue(7000);

    fireEvent.click(screen.getByRole("button", {
      name: "Descartar cambios y cargar la versión actual",
    }));

    await waitFor(() => expect(screen.getByLabelText("Precio COP")).toHaveValue(9000));
    expect(screen.queryByRole("button", { name: /Conflicto/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar artículo" })).toBeEnabled();
    expect(screen.queryByText("Cambios sin guardar.")).not.toBeInTheDocument();
  });
});
