import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:4321" },
  webServer: {
    command: "npm run preview -- --port 4321 --ignore-lock",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
  },
});
