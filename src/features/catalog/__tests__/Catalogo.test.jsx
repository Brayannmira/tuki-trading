import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Catalogo from "@/features/catalog/Catalogo.jsx";
import SelectionProvider from "@/shared/state/selection/SelectionProvider.jsx";

describe("Catalogo", () => {
  it("announces loading and then displays catalog data", async () => {
    let resolveCatalog;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => {
      resolveCatalog = resolve;
    })));

    render(
      <MemoryRouter>
        <SelectionProvider>
          <Catalogo />
        </SelectionProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Cargando precios y disponibilidad",
    );

    await act(async () => {
      resolveCatalog(new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });

    expect(screen.queryByText("Cargando precios y disponibilidad"))
      .not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Warframes" })).toBeInTheDocument();
  });

  it("announces catalog request errors without hiding static catalog items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("API no disponible")));

    render(
      <MemoryRouter>
        <SelectionProvider>
          <Catalogo />
        </SelectionProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("API no disponible");
    expect(screen.getByRole("heading", { name: "Warframes" })).toBeInTheDocument();
  });
});
