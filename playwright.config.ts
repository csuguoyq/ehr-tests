import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

/**
 * EHR Playwright test framework config.
 *
 * Environment (loaded from .env, inline env wins):
 *   EHR_HOST      target box short name, e.g. fbch34  (default: fbch34)
 *   EHR_USER      portal username                     (default: demo)
 *   EHR_PASS      portal password                     (default: 123)
 *   WEBFRAME_DIR  webframe directory override         (default: webframe)
 *
 * ⚠️ Never copy a host out of an example — fbch34/fbch19/pdgdev05 are different
 * machines. Resolve EHR_HOST from the environment or .env, and state which host
 * a run executed on when reporting results.
 */
dotenv.config({ path: path.resolve(__dirname, ".env") });

const EHR_HOST = process.env.EHR_HOST || "fbch34";
const WEBFRAME_DIR = process.env.WEBFRAME_DIR || "webframe";
export const EHR_BASE_URL = `https://${EHR_HOST}.clinicomp.com/${WEBFRAME_DIR}/index.php`;

/**
 * Viewing a run: set HEADLESS=0 (or just pass --headed) to open a visible
 * browser window (maximized, and kept open KEEP_BROWSER_MS=60000 by default
 * after the test finishes), and SLOW_MO=<ms> to slow every action.
 * Inline env wins over .env (dotenv does not override already-set vars):
 *   HEADLESS=0 npx playwright test specs/login.spec.ts
 */
const HEADLESS = process.env.HEADLESS ? process.env.HEADLESS !== "0" : true;

export default defineConfig({
  testDir: "./specs",
  timeout: 1_800_000,  // 30min — slow-mo headed E2E chains (TC35520 ~4min, TC35474 polls minutes)
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["junit", { outputFile: "test-results/ehr-junit.xml" }],
  ],
  use: {
    baseURL: EHR_BASE_URL,
    headless: HEADLESS,
    ignoreHTTPSErrors: true,
    /* viewport:null → follow the real window (the browser fixture launches
       with --start-maximized) instead of a fixed 1680x1000 emulation box. */
    viewport: null,
    /* Failure evidence: trace + screenshot + video, per PROJECT.md. */
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      /* Plain chromium, no devices["Desktop Chrome"] spread: that preset pins
         viewport to 1280x720 + deviceScaleFactor, and deviceScaleFactor is
         rejected outright when viewport:null (follow the real window). */
      name: "chromium",
      use: { browserName: "chromium", viewport: null },
    },
  ],
});
