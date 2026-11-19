import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import SelectionProvider from "../Components/SelectionProvider.jsx";
import { useSelection } from "../Components/SelectionContext.js";

function CartProbe() {
  const { selectedItems, toggleItem, updateQuantity, clearSelection } = useSelection();
  const item = {
    id: "warframes:Ash Prime",
    catalogId: "warframes:Ash Prime",
    name: "Ash Prime",
    category: "Warframes",
    quantity: 1,
  };

  return (
    <>
      <button type="button" onClick={() => toggleItem(item)}>Alternar</button>
      <button type="button" onClick={() => updateQuantity(item.id, 3)}>Cantidad 3</button>
      <button type="button" onClick={clearSelection}>Limpiar</button>
      <output>{selectedItems[0]?.quantity ?? 0}</output>
    </>
  );
}

describe("SelectionProvider", () => {
  beforeEach(() => localStorage.clear());

  it("adds, updates, persists, and clears selected items", () => {
    render(
      <SelectionProvider>
        <CartProbe />
      </SelectionProvider>,
    );

    fireEvent.click(screen.getByText("Alternar"));
    fireEvent.click(screen.getByText("Cantidad 3"));
    expect(screen.getByRole("status")).toHaveTextContent("3");
    expect(JSON.parse(localStorage.getItem("tuki-trading-cart"))[0].quantity).toBe(3);

    fireEvent.click(screen.getByText("Limpiar"));
    expect(screen.getByRole("status")).toHaveTextContent("0");
  });
});
