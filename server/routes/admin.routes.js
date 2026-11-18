import { Router } from "express";
import {
  changePassword,
  getSession,
  login,
  logout,
} from "../controllers/admin.controller.js";
import {
  deleteOrder,
  listOrders,
  updateOrderStatus,
} from "../controllers/orders.controller.js";
import { requireAdmin, requireSameOrigin } from "../middleware/adminAuth.js";
import { loginRateLimit } from "../middleware/rateLimiters.js";

export const adminRouter = Router();

adminRouter.post("/login", requireSameOrigin, loginRateLimit, login);
adminRouter.get("/session", getSession);
adminRouter.post("/logout", requireSameOrigin, logout);
adminRouter.get("/orders", requireAdmin, listOrders);
adminRouter.post("/password", requireAdmin, requireSameOrigin, loginRateLimit, changePassword);
adminRouter.patch("/orders/:id/status", requireAdmin, requireSameOrigin, updateOrderStatus);
adminRouter.delete("/orders/:id", requireAdmin, requireSameOrigin, deleteOrder);