import { Router } from "express";
import {
  getSession,
  listOrders,
  logout,
  requestLoginCode,
  verifyLoginCode,
} from "../controllers/customer.controller.js";
import { requireSameOrigin } from "../middleware/adminAuth.js";
import { requireCustomer } from "../middleware/customerAuth.js";
import {
  customerCodeRequestRateLimit,
  customerCodeVerifyRateLimit,
} from "../middleware/rateLimiters.js";

export const customerRouter = Router();

customerRouter.use((_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
customerRouter.post(
  "/auth/request-code",
  requireSameOrigin,
  customerCodeRequestRateLimit,
  requestLoginCode,
);
customerRouter.post(
  "/auth/verify-code",
  requireSameOrigin,
  customerCodeVerifyRateLimit,
  verifyLoginCode,
);
customerRouter.get("/session", getSession);
customerRouter.post("/logout", requireSameOrigin, logout);
customerRouter.get("/orders", requireCustomer, listOrders);
