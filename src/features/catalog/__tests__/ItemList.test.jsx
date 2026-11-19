import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import ItemList from "@/features/catalog/ItemList.jsx";
import SelectionProvider from "@/shared/state/selection/SelectionProvider.jsx";

const items = [
  { name: "Ash Prime", image: "/Ash-Prime.png", type: "Prime", rarity: "Raro" },
  { name: "Gauss Prime", image: "/Gauss-Prime.png", type: "Prime", rarity: "Legendario" },
];

const catalogProducts = {
  "warframes:Ash Prime": {
    availability: "Disponible",
    stockQuantity: 2,
    priceCop: 12000,
    pricePlatinum: 20,
  },
  "warframes:Gauss Prime": {
    availability: "Agotado",
    stockQuantity: 0,
    priceCop: null,
    pricePlatinum: null,
  },
};

describe("ItemList", () => {
  beforeEach(() => localStorage.clear());

  it("filters by search and favorite selection", () => {
    localStorage.setItem(
      "tuki-trading-favorites",
      JSON.stringify(["warframes:Ash Prime"]),
    );
    render(
      <SelectionProvider>
        <ItemList
          items={items}
          title="Warframes"
          searchTerm="Ash"
          categoryId="warframes"
          soloFavoritos
          catalogProducts={catalogProducts}
        />
      </SelectionProvider>,
    );

    expect(screen.getByText("Ash Prime")).toBeInTheDocument();
    expect(screen.queryByText("Gauss Prime")).not.toBeInTheDocument();
  });

  it("toggles favorites and prevents selecting unavailable products", () => {
    render(
      <SelectionProvider>
        <ItemList
          items={items}
          title="Warframes"
          searchTerm=""
          categoryId="warframes"
          catalogProducts={catalogProducts}
        />
      </SelectionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Agregar Ash Prime a favoritos" }));
    expect(screen.getByRole("button", { name: "Quitar Ash Prime de favoritos" }))
      .toHaveAttribute("aria-pressed", "true");

    const unavailableButton = screen.getByRole("button", { name: "No disponible" });
    expect(unavailableButton).toBeDisabled();
  });

  it("applies status and rarity filters", () => {
    render(
      <SelectionProvider>
        <ItemList
          items={items}
          title="Warframes"
          searchTerm=""
          categoryId="warframes"
          rarezasActivas={["Legendario"]}
          estadosActivos={["Agotado"]}
          catalogProducts={catalogProducts}
        />
      </SelectionProvider>,
    );

    expect(screen.queryByText("Ash Prime")).not.toBeInTheDocument();
    expect(screen.getByText("Gauss Prime")).toBeInTheDocument();
  });
});
