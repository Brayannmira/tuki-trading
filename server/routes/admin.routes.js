import { Router } from "express";
import {
  listAdminCatalog,
  importCatalogItems,
  updateCatalogItem,
} from "../controllers/catalog.controller.js";
import { downloadDatabaseBackup } from "../controllers/backup.controller.js";
import {
  changePassword,
  createUser,
  deactivateUser,
  getMfaSetup,
  getSession,
  listUsers,
  login,
  logout,
  resetUserMfa,
  updateUserRole,
  verifyMfaSetup,
} from "../controllers/admin.controller.js";
import {
  deleteOrder,
  listOrders,
  listAdminAudit,
  retryOrderStatusNotification,
  updateOrderStatus,
} from "../controllers/orders.controller.js";
import {
  requireAdmin,
  requireMfaSetup,
  requireOwner,
  requirePermission,
  requireSameOrigin,
} from "../middleware/adminAuth.js";
import {
  adminMfaSetupRateLimit,
  adminPasswordChangeRateLimit,
  loginRateLimit,
} from "../middleware/rateLimiters.js";

export const adminRouter = Router();

adminRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
adminRouter.post("/login", requireSameOrigin, loginRateLimit, login);
adminRouter.get("/session", getSession);
adminRouter.post("/logout", requireSameOrigin, logout);
adminRouter.get("/mfa/setup", requireMfaSetup, getMfaSetup);
adminRouter.post(
  "/mfa/verify",
  requireSameOrigin,
  requireMfaSetup,
  adminMfaSetupRateLimit,
  verifyMfaSetup,
);
adminRouter.get("/orders", requireAdmin, requirePermission("orders:read"), listOrders);
adminRouter.post(
  "/password",
  requireAdmin,
  requireSameOrigin,
  adminPasswordChangeRateLimit,
  changePassword,
);
adminRouter.patch(
  "/orders/:id/status",
  requireAdmin,
  requirePermission("orders:write"),
  requireSameOrigin,
  updateOrderStatus,
);
adminRouter.post(
  "/notifications/:notificationId/retry",
  requireAdmin,
  requirePermission("orders:write"),
  requireSameOrigin,
  retryOrderStatusNotification,
);
adminRouter.delete(
  "/orders/:id",
  requireAdmin,
  requirePermission("orders:write"),
  requireSameOrigin,
  deleteOrder,
);
adminRouter.get("/catalog", requireAdmin, requirePermission("catalog:read"), listAdminCatalog);
adminRouter.patch(
  "/catalog/:id",
  requireAdmin,
  requirePermission("catalog:write"),
  requireSameOrigin,
  updateCatalogItem,
);
adminRouter.post(
  "/catalog/import",
  requireAdmin,
  requirePermission("catalog:write"),
  requireSameOrigin,
  importCatalogItems,
);
adminRouter.post(
  "/backup",
  requireAdmin,
  requirePermission("backup:download"),
  requireSameOrigin,
  downloadDatabaseBackup,
);
adminRouter.get("/audit", requireAdmin, requirePermission("audit:read"), listAdminAudit);
adminRouter.get("/users", requireAdmin, requireOwner, listUsers);
adminRouter.post("/users", requireAdmin, requireOwner, requireSameOrigin, createUser);
adminRouter.patch("/users/:id/role", requireAdmin, requireOwner, requireSameOrigin, updateUserRole);
adminRouter.post(
  "/users/:id/mfa-reset",
  requireAdmin,
  requireOwner,
  requireSameOrigin,
  resetUserMfa,
);
adminRouter.delete(
  "/users/:id",
  requireAdmin,
  requireOwner,
  requireSameOrigin,
  deactivateUser,
);
