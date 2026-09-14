import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks against a real build.
 *
 * These cover the public surface — the pages reachable without a Supabase
 * session — plus the responsive and accessibility rules that apply to every
 * page. The authenticated views need a live project, so they are checked
 * against a staging deployment by pointing BASE_URL at it.
 */
const PORT = Number(process.env.PORT ?? 3210);
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Sandboxes that ship their own Chromium set this rather than letting
    // Playwright download a build it has pinned to its own version. CI leaves
    // it unset and uses `playwright install`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Reuse an already-running dev server locally; start one in CI.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key",
        },
      },
});
