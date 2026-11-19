import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDirectory = mkdtempSync(join(tmpdir(), "tuki-trading-e2e-"));
process.env.DATABASE_PATH = join(dataDirectory, "orders.sqlite");

const [{ config }, { createApp }, { default: database }] = await Promise.all([
  import("./config/env.js"),
  import("./app.js"),
  import("./db/database.js"),
]);

const app = createApp();
app.post("/__e2e/shutdown", (request, response) => {
  const controlSecret = process.env.PLAYWRIGHT_CONTROL_SECRET;
  if (!controlSecret || request.get("authorization") !== `Bearer ${controlSecret}`) {
    return response.sendStatus(404);
  }

  response.once("finish", () => {
    database.close();
    rmSync(dataDirectory, { recursive: true, force: true });
    server.close(() => process.exit(0));
  });
  return response.sendStatus(204);
});

const server = app.listen(config.port, "127.0.0.1", () => {
  console.log(`E2E API lista en http://127.0.0.1:${config.port}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  const forceClose = setTimeout(() => server.closeAllConnections(), 5000);
  forceClose.unref();
  server.close(() => {
    clearTimeout(forceClose);
    database.close();
    rmSync(dataDirectory, { recursive: true, force: true });
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
