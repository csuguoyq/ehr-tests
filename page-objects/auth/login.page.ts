// page-objects/auth/login.page.ts — Login page object (ExtJS logon form).
//
// Locators are verified against the live portal and kept authoritative here.
// Page Object rules: atomic actions + assertions + dialog handling only —
// no business branching, no flow orchestration.

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";
import { waitLoggedInTitle } from "../../src/utils/wait";

export class LoginPage {
  readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  /** The logon page defaults to Smart Card; this link reveals the username form. */
  readonly usernamePasswordLink: Locator;
  /** US Privacy Act warning dialog shown on first entry on some boxes. */
  readonly privacyActWarning: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.usernameInput = page.locator("input[placeholder='Username']").first();
    this.passwordInput = page.locator("input[placeholder='Password']").first();
    this.usernamePasswordLink = page.getByText("Username/Password Login", { exact: true }).first();
    this.privacyActWarning = page.getByText("PRIVACY ACT WARNING");
  }

  async open(): Promise<void> {
    // Login is ONLY established through the logon entry (webtoken in sessionStorage).
    // The page may land on Smart Card login (username form hidden) or behind the
    // privacy warning — any of those three proves the logon page is ready.
    await this.page.goto(`${this.env.baseUrl}/logon?ctrl=cps`, { waitUntil: "domcontentloaded" });
    await this.usernameInput
      .or(this.usernamePasswordLink)
      .or(this.privacyActWarning)
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
  }

  /** Dismiss the Privacy Act warning if this box shows one. */
  async dismissWarningIfPresent(): Promise<void> {
    if (await this.privacyActWarning.isVisible().catch(() => false)) {
      const agree = this.page.locator(".x-window button:visible").first();
      await agree.click();
      await this.privacyActWarning.waitFor({ state: "hidden", timeout: 10_000 });
    }
  }

  /** Reveal the Username/Password form if the page landed on Smart Card. */
  async ensureUsernamePasswordForm(): Promise<void> {
    if (!(await this.usernameInput.isVisible().catch(() => false))) {
      await this.usernamePasswordLink.click();
      await this.usernameInput.waitFor({ state: "visible", timeout: 15_000 });
    }
  }

  /**
   * Fill credentials SEQUENTIALLY — two concurrent fills race on this ExtJS
   * form (verified 2026-09-09: username ended up empty, password held the
   * concatenation). Small settle waits between fields are part of the
   * verified sequence.
   */
  async fillCredentials(username: string, password: string): Promise<void> {
    await this.usernameInput.click();
    await this.usernameInput.fill(username);
    await this.page.waitForTimeout(400);
    await this.passwordInput.click();
    await this.passwordInput.fill(password);
    await this.page.waitForTimeout(400);
  }

  async submit(): Promise<void> {
    await this.passwordInput.press("Enter");
  }

  /** Logged-in is confirmed by the title prefix `<USER, <NAME>> CliniComp|EHR ...`. */
  async expectLoggedIn(): Promise<void> {
    await waitLoggedInTitle(this.page);
    await expect(this.page).toHaveTitle(/CliniComp/);
  }
}
