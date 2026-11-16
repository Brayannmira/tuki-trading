import { Router } from "express";
import {
  getSession,
  login,
  logout,
} from "../controllers/admin.controller.js";
import {
  listOrders,
  updateOrderStatus,
} from "../controllers/orders.controller.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { loginRateLimit } from "../middleware/rateLimiters.js";

export const adminRouter = Router();

adminRouter.post("/login", loginRateLimit, login);
adminRouter.get("/session", getSession);
adminRouter.post("/logout", logout);
adminRouter.get("/orders", requireAdmin, listOrders);
adminRouter.patch("/orders/:id/status", requireAdmin, updateOrderStatus);
