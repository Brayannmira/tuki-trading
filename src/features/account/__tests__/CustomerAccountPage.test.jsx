import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CustomerAccountPage from "@/features/account/CustomerAccountPage.jsx";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("CustomerAccountPage", () => {
  it("verifies an email code and displays the customer's order history", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({
        message: "Si el correo puede recibir códigos, te enviaremos uno en breve.",
      }, 202))
      .mockResolvedValueOnce(jsonResponse({
        authenticated: true,
        email: "customer@example.com",
        gameNickname: null,
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{
          id: "order-123",
          status: "En proceso",
          paymentMethod: "Dinero (COP)",
          totalAmount: 12000,
          currency: "COP",
          createdAt: "2026-11-18T12:00:00.000Z",
          notification: { status: "sent", sentAt: "2026-11-19T12:00:00.000Z" },
          items: [{ name: "Artículo de prueba", quantity: 2 }],
          history: [{ status: "En proceso", changedAt: "2026-11-19T12:00:00.000Z" }],
        }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        email: "customer@example.com",
        gameNickname: "Player_One",
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <CustomerAccountPage />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("Correo electrónico"), {
      target: { value: "customer@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await screen.findByLabelText("Código de acceso")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Código de acceso"), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("order-123")).toBeInTheDocument();
    expect(screen.getByText("Artículo de prueba")).toBeInTheDocument();
    expect(screen.getByText(/Aviso de estado enviado el/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nickname del juego"), {
      target: { value: "Player_One" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
    expect(await screen.findByText("Perfil actualizado.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/customer/auth/verify-code",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "customer@example.com", code: "12345678" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/customer/profile",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ gameNickname: "Player_One" }),
      }),
    );
  });

  it("explains when email delivery is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({
        error: "El acceso por correo no está disponible hasta configurar SMTP.",
      }, 503)));

    render(
      <MemoryRouter>
        <CustomerAccountPage />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("Correo electrónico"), {
      target: { value: "customer@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El acceso por correo no está disponible hasta configurar SMTP.",
    );
  });
});
