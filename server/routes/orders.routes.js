import { Router } from "express";
import {
  createOrder,
  getOrderStatus,
} from "../controllers/orders.controller.js";
import {
  orderRateLimit,
  orderStatusRateLimit,
} from "../middleware/rateLimiters.js";

export const ordersRouter = Router();

ordersRouter.post("/", orderRateLimit, createOrder);
ordersRouter.get("/:id/status", orderStatusRateLimit, getOrderStatus);
