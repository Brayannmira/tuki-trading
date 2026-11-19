import { randomBytes } from "node:crypto";
import process from "node:process";
import { defineConfig } from "@playwright/test";

const apiOrigin = "http://127.0.0.1:3001";
const appOrigin = "http://127.0.0.1:5173";
const controlSecret = randomBytes(32).toString("hex");
process.env.PLAYWRIGHT_CONTROL_SECRET = controlSecret;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: appOrigin,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "node server/playwright.js",
      url: `${apiOrigin}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: "3001",
        APP_ORIGIN: appOrigin,
        ADMIN_USERNAME: "playwright-admin",
        ADMIN_PASSWORD: "playwright-test-password-2026",
        SESSION_SECRET: "playwright-session-secret-for-isolated-tests",
        PLAYWRIGHT_CONTROL_SECRET: controlSecret,
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
      url: appOrigin,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  globalTeardown: "./playwright.global-teardown.js",
});
