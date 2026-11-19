import express from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adminRouter } from "./routes/admin.routes.js";
import { catalogRouter } from "./routes/catalog.routes.js";
import { customerRouter } from "./routes/customer.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { ordersRouter } from "./routes/orders.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { config } from "./config/env.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "25kb" }));
  app.use("/api/health", healthRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/customer", customerRouter);
  app.use("/api/admin", adminRouter);

  if (config.isProduction) {
    const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const distDirectory = join(projectRoot, "dist");
    if (existsSync(distDirectory)) {
      app.use(express.static(distDirectory, {
        maxAge: "1h",
        etag: true,
      }));
      app.get(/.*/, (request, response, next) => {
        if (request.path.startsWith("/api")) return next();
        response.sendFile(join(distDirectory, "index.html"));
      });
    }
  }

  app.use(errorHandler);

  return app;
}
