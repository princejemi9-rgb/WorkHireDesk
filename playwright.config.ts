import { defineConfig, devices } from "@playwright/test";
const port = process.env.E2E_PORT || "3000";
const baseURL = `http://localhost:${port}`;
export default defineConfig({
  testIgnore: "admin-product.spec.ts",
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL, trace: "off", screenshot: "off", video: "off", launchOptions: { channel: process.env.CI ? undefined : "chrome" } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: { command: `node node_modules/next/dist/bin/next ${process.env.E2E_PRODUCTION ? "start" : "dev"} --port ${port}`, url: `${baseURL}/apply`, reuseExistingServer: !process.env.CI, timeout: 300_000 },
});
