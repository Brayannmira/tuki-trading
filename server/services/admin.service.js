import { timingSafeEqual } from "node:crypto";
import { config } from "../config/env.js";

function constantTimeEqual(first, second) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

export function hasValidAdminCredentials(username, password) {
  return (
    typeof username === "string" &&
    typeof password === "string" &&
    constantTimeEqual(username, config.adminUsername) &&
    constantTimeEqual(password, config.adminPassword)
  );
}
