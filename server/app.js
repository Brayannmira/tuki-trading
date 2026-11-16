import express from "express";
import helmet from "helmet";
import { adminRouter } from "./routes/admin.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { ordersRouter } from "./routes/orders.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "25kb" }));
  app.use("/api/health", healthRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/admin", adminRouter);
  app.use(errorHandler);

  return app;
}
