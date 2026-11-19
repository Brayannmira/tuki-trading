import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "@/features/admin/AdminPage.jsx";

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

function renderAdminPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe("AdminPage", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires TOTP enrollment and shows one-time recovery codes before access", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({ mfaSetupRequired: true }))
      .mockResolvedValueOnce(jsonResponse({
        username: "owner",
        secret: "JBSWY3DPEHPK3PXP",
        otpauthUri: "otpauth://totp/Tuki%20Trading%3Aowner?secret=JBSWY3DPEHPK3PXP",
      }))
      .mockResolvedValueOnce(jsonResponse({
        authenticated: true,
        username: "owner",
        role: "owner",
        permissions: ["orders:read", "orders:write", "catalog:read", "catalog:write", "audit:read", "backup:download", "admins:manage"],
        mustChangePassword: false,
        recoveryCodes: ["0123456789abcdef0123", "abcdef0123456789abcd"],
      }));
    vi.stubGlobal("fetch", fetchMock);
    renderAdminPage();

    fireEvent.change(await screen.findByLabelText("Identificador"), {
      target: { value: "owner" },
    });
    fireEvent.change(screen.getByLabelText("Llave de acceso"), {
      target: { value: "owner-initial-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Desbloquear bodega" }));

    expect(await screen.findByRole("heading", { name: "Configura tu app autenticadora" }))
      .toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Código de 6 dígitos"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activar segundo factor" }));

    expect(await screen.findByRole("heading", { name: "Guarda tus códigos de recuperación" }))
      .toBeInTheDocument();
    expect(screen.getByText("0123456789abcdef0123")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Panel administrativo" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/mfa/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "123456" }),
      }),
    );
  });

  it("keeps viewer catalog controls read-only and hides disallowed panels", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }))
      .mockResolvedValueOnce(jsonResponse({
        authenticated: true,
        username: "viewer",
        role: "viewer",
        permissions: ["orders:read", "catalog:read", "audit:read"],
        mustChangePassword: false,
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
        summary: { thisMonth: 0, active: 0, completed: 0, cancelled: 0, chartData: [] },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
      }))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    renderAdminPage();

    fireEvent.change(await screen.findByLabelText("Identificador"), {
      target: { value: "viewer" },
    });
    fireEvent.change(screen.getByLabelText("Llave de acceso"), {
      target: { value: "viewer-secure-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Desbloquear bodega" }));

    expect(await screen.findByRole("heading", { name: "Solicitudes recibidas" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Catálogo e inventario" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Administradores y permisos" }))
      .not.toBeInTheDocument();
    fireEvent.click(await screen.findByText("100 platinos"));
    await waitFor(() => {
      expect(screen.getAllByLabelText("Precio COP")[0]).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Guardar artículo" })).not.toBeInTheDocument();
    });
  });
});
