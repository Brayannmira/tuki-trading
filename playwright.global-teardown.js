import process from "node:process";

export default async function globalTeardown() {
  const controlSecret = process.env.PLAYWRIGHT_CONTROL_SECRET;
  if (!controlSecret) {
    throw new Error("Falta el secreto de cierre del servidor E2E.");
  }

  const response = await fetch("http://127.0.0.1:3001/__e2e/shutdown", {
    method: "POST",
    headers: {
      authorization: `Bearer ${controlSecret}`,
    },
  });
  if (!response.ok) {
    throw new Error(`No se pudo cerrar el servidor E2E (HTTP ${response.status}).`);
  }
}
