import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Formulario from "../Components/Formulario.jsx";
import SelectionProvider from "../Components/SelectionProvider.jsx";

describe("Formulario", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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

    const fetchMock = vi.fn()
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
      }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <SelectionProvider>
          <Formulario />
        </SelectionProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Nombre real"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Nickname del juego"), { target: { value: "ana_game" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.click(screen.getByLabelText("Dinero (COP)"));

    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    expect(screen.getByRole("button", { name: "Enviando solicitud..." })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText(/Número de pedido:/)).toBeInTheDocument();
    });
    expect(screen.getByText(/\$24\.000 COP/)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).email).toBe("ana@example.com");
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"])
      .toMatch(/^[\da-f-]{36}$/i);
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
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(await screen.findByRole("alert"))
      .toHaveTextContent("Ash Prime no tiene existencias suficientes.");
    expect(screen.getByLabelText("Nombre real")).toHaveValue("Ana");
    expect(screen.getByLabelText("Nickname del juego")).toHaveValue("ana_game");
    expect(screen.getByLabelText("Correo electrónico")).toHaveValue("ana@example.com");
    expect(screen.getByLabelText("Cantidad")).toHaveValue(1);
    expect(screen.getByRole("heading", { name: /Artículos seleccionados \(1\)/ }))
      .toBeInTheDocument();
  });

  it("shows the order breakdown and conditions before submission", async () => {
    localStorage.setItem("tuki-trading-cart", JSON.stringify([{
      id: "warframes:Ash Prime",
      catalogId: "warframes:Ash Prime",
      name: "Ash Prime",
      category: "Warframes",
      quantity: 2,
    }]));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{
      id: "warframes:Ash Prime",
      priceCop: 12000,
      pricePlatinum: 20,
      availability: "Disponible",
      stockQuantity: 5,
    }]), { status: 200, headers: { "content-type": "application/json" } })));

    render(
      <MemoryRouter>
        <SelectionProvider>
          <Formulario />
        </SelectionProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText("Dinero (COP)"));

    expect(await screen.findByText("Precio unitario: $12.000 COP")).toBeInTheDocument();
    expect(screen.getByText("Subtotal: $24.000 COP")).toBeInTheDocument();
    expect(screen.getByText(/Total estimado \(2 unidades\): \$24\.000 COP/)).toBeInTheDocument();
    expect(screen.getByText(/no se realiza un cobro ni se confirma disponibilidad o entrega/))
      .toBeInTheDocument();
  });

  it("ignores repeated submits while an order request is in progress", async () => {
    localStorage.setItem("tuki-trading-cart", JSON.stringify([{
      id: "warframes:Ash Prime",
      catalogId: "warframes:Ash Prime",
      name: "Ash Prime",
      category: "Warframes",
      quantity: 1,
    }]));

    let resolveOrderRequest;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveOrderRequest = resolve;
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <SelectionProvider>
          <Formulario />
        </SelectionProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Nombre real"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Nickname del juego"), { target: { value: "ana_game" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "ana@example.com" },
    });
    const form = screen.getByRole("button", { name: "Enviar solicitud" }).closest("form");
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("button", { name: "Enviando solicitud..." })).toBeDisabled();
    expect(screen.getByLabelText("Nombre real")).toHaveValue("Ana");

    resolveOrderRequest(new Response(JSON.stringify({
      id: "order-456",
      totalAmount: null,
      currency: "Platino",
      trackingToken: "y".repeat(43),
      status: "Pendiente",
    }), { status: 201, headers: { "content-type": "application/json" } }));
    await screen.findByText(/Número de pedido:/);
  });

  it("reuses the idempotency key after a network error", async () => {
    localStorage.setItem("tuki-trading-cart", JSON.stringify([{
      id: "warframes:Ash Prime",
      catalogId: "warframes:Ash Prime",
      name: "Ash Prime",
      category: "Warframes",
      quantity: 1,
    }]));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "order-retry",
        totalAmount: null,
        currency: "Platino",
        trackingToken: "z".repeat(43),
        status: "Pendiente",
      }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <SelectionProvider>
          <Formulario />
        </SelectionProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Nombre real"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Nickname del juego"), { target: { value: "ana_game" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    const firstKey = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await screen.findByText(/Número de pedido:/);
    const retryKey = fetchMock.mock.calls[2][1].headers["Idempotency-Key"];
    expect(retryKey).toBe(firstKey);
  });

  it("keeps the retry key after the form page reloads", async () => {
    localStorage.setItem("tuki-trading-cart", JSON.stringify([{
      id: "warframes:Ash Prime",
      catalogId: "warframes:Ash Prime",
      name: "Ash Prime",
      category: "Warframes",
      quantity: 1,
    }]));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "order-after-reload",
        totalAmount: null,
        currency: "Platino",
        trackingToken: "a".repeat(43),
        status: "Pendiente",
      }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const firstRender = render(
      <MemoryRouter>
        <SelectionProvider>
          <Formulario />
        </SelectionProvider>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Nombre real"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Nickname del juego"), { target: { value: "ana_game" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    const firstKey = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    expect(sessionStorage.getItem("tuki-trading-pending-order-key")).toBe(firstKey);
    firstRender.unmount();

    render(
      <MemoryRouter>
        <SelectionProvider>
          <Formulario />
        </SelectionProvider>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Nombre real"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Nickname del juego"), { target: { value: "ana_game" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "ana@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await screen.findByText(/Número de pedido:/);
    expect(fetchMock.mock.calls[3][1].headers["Idempotency-Key"]).toBe(firstKey);
    expect(sessionStorage.getItem("tuki-trading-pending-order-key")).toBeNull();
  });
});
