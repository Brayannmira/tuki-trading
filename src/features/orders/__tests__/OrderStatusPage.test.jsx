import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrderStatusPage from "@/features/orders/OrderStatusPage.jsx";

describe("OrderStatusPage", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows loading and status timeline after a successful lookup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "order-123",
      status: "En proceso",
      updatedAt: "2026-11-19T06:00:00.000Z",
      history: [
        { status: "Pendiente", changedAt: "2026-11-18T06:00:00.000Z" },
        { status: "En proceso", changedAt: "2026-11-19T06:00:00.000Z" },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    render(
      <MemoryRouter>
        <OrderStatusPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Número de pedido"), {
      target: { value: "order-123" },
    });
    fireEvent.change(screen.getByLabelText("Código de seguimiento"), {
      target: { value: "x".repeat(43) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));

    expect(screen.getByRole("button", { name: "Consultando..." })).toBeDisabled();
    expect(await screen.findByRole("heading", { name: "En proceso" })).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  it("shows a lookup error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "No se encontró el pedido.",
    }), { status: 404, headers: { "content-type": "application/json" } })));

    render(
      <MemoryRouter>
        <OrderStatusPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Número de pedido"), {
      target: { value: "unknown" },
    });
    fireEvent.change(screen.getByLabelText("Código de seguimiento"), {
      target: { value: "x".repeat(43) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Consultar estado" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se encontró el pedido.");
  });
});
