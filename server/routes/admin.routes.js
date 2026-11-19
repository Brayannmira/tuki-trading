import { Router } from "express";
import {
  listAdminCatalog,
  importCatalogItems,
  updateCatalogItem,
} from "../controllers/catalog.controller.js";
import { downloadDatabaseBackup } from "../controllers/backup.controller.js";
import {
  changePassword,
  getSession,
  login,
  logout,
} from "../controllers/admin.controller.js";
import {
  deleteOrder,
  listOrders,
  listAdminAudit,
  retryOrderStatusNotification,
  updateOrderStatus,
} from "../controllers/orders.controller.js";
import { requireAdmin, requireSameOrigin } from "../middleware/adminAuth.js";
import { loginRateLimit } from "../middleware/rateLimiters.js";

export const adminRouter = Router();

adminRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
adminRouter.post("/login", requireSameOrigin, loginRateLimit, login);
adminRouter.get("/session", getSession);
adminRouter.post("/logout", requireSameOrigin, logout);
adminRouter.get("/orders", requireAdmin, listOrders);
adminRouter.post("/password", requireAdmin, requireSameOrigin, loginRateLimit, changePassword);
adminRouter.patch("/orders/:id/status", requireAdmin, requireSameOrigin, updateOrderStatus);
adminRouter.post(
  "/notifications/:notificationId/retry",
  requireAdmin,
  requireSameOrigin,
  retryOrderStatusNotification,
);
adminRouter.delete("/orders/:id", requireAdmin, requireSameOrigin, deleteOrder);
adminRouter.get("/catalog", requireAdmin, listAdminCatalog);
adminRouter.patch("/catalog/:id", requireAdmin, requireSameOrigin, updateCatalogItem);
adminRouter.post("/catalog/import", requireAdmin, requireSameOrigin, importCatalogItems);
adminRouter.post("/backup", requireAdmin, requireSameOrigin, downloadDatabaseBackup);
adminRouter.get("/audit", requireAdmin, listAdminAudit);