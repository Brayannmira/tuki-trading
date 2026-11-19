import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Formulario from "../Components/Formulario.jsx";
import SelectionProvider from "../Components/SelectionProvider.jsx";

describe("Formulario", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows loading and success states after submitting an order", async () => {
    localStorage.setItem("tuki-trading-cart", JSON.stringify([{
      id: "warframes:Ash Prime",
      catalogId: "warframes:Ash Prime",
      name: "Ash Prime",
      category: "Warframes",
      quantity: 2,
    }]));

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: "warframes:Ash Prime",
        priceCop: 12000,
        pricePlatinum: 20,
        availability: "Disponible",
        stockQuantity: 5,
      }]), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "order-123",
        totalAmount: 24000,
        currency: "COP",
        trackingToken: "x".repeat(43),
        status: "Pendiente",
      }), { status: 201, headers: { "content-type": "application/json" } })));

    render(
      <MemoryRouter>
        <SelectionProvider>
          <Formulario />
        </SelectionProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Nombre real"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Nickname del juego"), { target: { value: "ana_game" } });
    fireEvent.click(screen.getByLabelText("Dinero (COP)"));

    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    expect(screen.getByRole("button", { name: "Enviando solicitud..." })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText(/Número de pedido:/)).toBeInTheDocument();
    });
    expect(screen.getByText(/\$24\.000 COP/)).toBeInTheDocument();
  });

  it("displays an API submission error", async () => {
    localStorage.setItem("tuki-trading-cart", JSON.stringify([{
      id: "warframes:Ash Prime",
      catalogId: "warframes:Ash Prime",
      name: "Ash Prime",
      category: "Warframes",
      quantity: 1,
    }]));

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "Ash Prime no tiene existencias suficientes.",
      }), { status: 409, headers: { "content-type": "application/json" } })));

    render(
      <MemoryRouter>
        <SelectionProvider>
          <Formulario />
        </SelectionProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Nombre real"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Nickname del juego"), { target: { value: "ana_game" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(await screen.findByRole("alert"))
      .toHaveTextContent("Ash Prime no tiene existencias suficientes.");
  });
});
