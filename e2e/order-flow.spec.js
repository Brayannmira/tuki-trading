import { expect, test } from "@playwright/test";

test("customer can submit and track a request", async ({ page }) => {
  await page.goto("/catalogo");
  await expect(page.getByRole("heading", { name: "CATÁLOGO DE WARFRAME" }))
    .toBeVisible();

  await page.getByRole("textbox", { name: "Buscar artículos del catálogo" })
    .fill("Ash Prime");
  const ashPrimeCard = page.locator(".item-card").filter({ hasText: "Ash Prime" });
  await expect(ashPrimeCard).toBeVisible();
  await ashPrimeCard.getByRole("button", { name: "Agregar al formulario" }).click();
  await expect(page.getByText("1 artículo seleccionado")).toBeVisible();

  await page.getByRole("link", { name: "Ir al formulario" }).click();
  await page.getByLabel("Nombre real").fill("Playwright Customer");
  await page.getByLabel("Nickname del juego").fill("PlaywrightTenno");
  await page.getByLabel("Dinero (COP)").check();
  await page.getByRole("button", { name: "Enviar solicitud" }).click();

  const successMessage = page.getByText("Solicitud recibida. Número de pedido:");
  await expect(successMessage).toBeVisible();
  const orderId = await page.locator(".trade-form-success p strong").first().innerText();
  const trackingToken = await page.locator(".tracking-token").innerText();
  expect(orderId).toBeTruthy();
  expect(trackingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText("Pendiente por cotizar").first()).toBeVisible();

  await page.getByRole("link", { name: "Consultar estado" }).click();
  await expect(page.getByLabel("Número de pedido")).toHaveValue(orderId);
  await expect(page.getByLabel("Código de seguimiento")).toHaveValue(trackingToken);
  await page.getByRole("button", { name: "Consultar estado" }).click();

  await expect(page.locator(".order-tracking-result h2")).toHaveText("Pendiente");
  await expect(page.locator(".order-status-timeline"))
    .toContainText("Pendiente");

  const pageFitsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(pageFitsViewport).toBe(true);
});
