import { rateLimit } from "express-rate-limit";
import { config } from "../config/env.js";

export const orderRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

export const orderStatusRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({ error: "Demasiadas consultas. Inténtalo de nuevo más tarde." });
  },
});

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProduction ? 5 : 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos de acceso. Inténtalo de nuevo más tarde." },
});

export const customerCodeRequestRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProduction ? 5 : 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Inténtalo de nuevo más tarde." },
});

export const customerCodeVerifyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProduction ? 20 : 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Inténtalo de nuevo más tarde." },
});
