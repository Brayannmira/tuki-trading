import { Router } from "express";
import { createOrder } from "../controllers/orders.controller.js";
import { orderRateLimit } from "../middleware/rateLimiters.js";

export const ordersRouter = Router();

ordersRouter.post("/", orderRateLimit, createOrder);
