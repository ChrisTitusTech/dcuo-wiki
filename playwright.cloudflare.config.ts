import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/cloudflare",
  use: { baseURL: "http://127.0.0.1:8787" },
  webServer: {
    command: "npm run preview:cloudflare",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
