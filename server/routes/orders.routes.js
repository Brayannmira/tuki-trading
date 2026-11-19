import { Router } from "express";
import {
  createOrder,
  getOrderStatus,
} from "../controllers/orders.controller.js";
import {
  orderRateLimit,
  orderStatusRateLimit,
} from "../middleware/rateLimiters.js";
import { attachOptionalCustomer } from "../middleware/customerAuth.js";

export const ordersRouter = Router();

ordersRouter.post("/", orderRateLimit, attachOptionalCustomer, createOrder);
ordersRouter.get("/:id/status", orderStatusRateLimit, getOrderStatus);
