// page-objects/registration/referral.page.ts — Registration → patient chart →
// Referral sub-tab → "New Referral" document-builder form (periop procedure
// referral). Selectors verified interactively on fbch34 (2026-09-20, TC35520).
//
// Form facts (live box):
// - Add button: [data-testid="referral-overview-add-referral-button"]
// - Every field renders a <p> label + an <input> inside a shared ancestor;
//   labels carry no asterisk in the DOM (e.g. "Refer To Provider").
// - Provider/NPI/Surgeon fields are searchable dropdowns: type → wait → click
//   the option row containing the provider id+NPI (picking fills the NPI).
// - Facility / Clinic-Dept / Service Type / Location / Encounter Type are MUI
//   selects (click input → click [role=option]); Clinic/Dept enables after
//   Facility, Encounter Type after Location.
// - Procedure / Associated DX-ICD-10 / CPT-Procedure Code are keyword search
//   dropdowns (server-side search: referral/getprocedure, charge/getIcd10,
//   referral/getcpts).
// - Create enabled only when every required field holds a value; success
//   shows the toast "Referral created successfully.".

import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { EhrEnvConfig } from "../../src/types/ehr-context";

export interface ProcedureReferralData {
  /** Search text for the Procedure dropdown (Procedure(s) section). */
  procedureKeyword: string;
  /** Text that the picked Procedure option must contain (e.g. CPT code). */
  procedureMatch: string;
  laterality: "Left" | "Right" | "Bilateral" | "N/A";
  /** Keyword for the Associated DX-ICD-10 search + text to pick. */
  dxKeyword: string;
  dxMatch: string;
  /** Keyword for the CPT/Procedure Code search + text to pick. */
  cptKeyword: string;
  cptMatch: string;
  surgeonNpi: string;
  serviceType: string;
  facility: string;
  clinicDept: string;
  location: string;
  encounterType: string;
  /** "MM/DD/YYYY HH:mm" (masked input). */
  requestedDatetime: string;
  providerNpi: string;
  procedureTimeMin: string;
  turnoverTimeMin: string;
  procedureReason?: string;
}

export class ReferralPage {
  private readonly page: Page;
  readonly env: EhrEnvConfig;

  readonly addReferralButton: Locator;

  constructor(page: Page, env: EhrEnvConfig) {
    this.page = page;
    this.env = env;
    this.addReferralButton = page.getByTestId("referral-overview-add-referral-button");
  }

  /** Field wrapper: <p> with the exact label, nearest ancestor holding an input. */
  private fieldRoot(label: string, index = 0): Locator {
    return this.page
      .locator("p", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
      .nth(index)
      .locator("xpath=ancestor::div[.//input][1]");
  }

  private option(text: string): Locator {
    return this.page
      .locator("[role=listbox] [role=option]")
      .filter({ hasText: text })
      .first();
  }

  /** Open the New Referral form from the Referral sub-tab overview. */
  async openNewForm(): Promise<void> {
    await this.addReferralButton.click();
    await expect(this.page.getByText("New Details")).toBeVisible({ timeout: 20_000 });
  }

  async pickProvider(label: string, npi: string, keyword = "dstest"): Promise<void> {
    const input = this.fieldRoot(label).locator("input").first();
    await input.click();
    await input.fill(keyword);
    const opt = this.option(npi);
    await expect(opt).toBeVisible({ timeout: 15_000 });
    await opt.click();
  }

  async pickMuiSelect(label: string, text: string, index = 0): Promise<void> {
    const input = this.fieldRoot(label, index).locator("input").first();
    await input.click();
    const opt = this.page
      .locator("[role=listbox] [role=option]")
      .filter({ hasText: new RegExp(`^${text}`) })
      .first();
    await expect(opt).toBeVisible({ timeout: 15_000 });
    await opt.click();
  }

  async pickSearchDropdown(label: string, keyword: string, match: string): Promise<void> {
    const input = this.fieldRoot(label).locator("input").first();
    await input.click();
    await input.fill(keyword);
    const opt = this.option(match);
    await expect(opt).toBeVisible({ timeout: 20_000 });
    await opt.click();
  }

  async pickLaterality(value: ProcedureReferralData["laterality"]): Promise<void> {
    await this.page.getByRole("button", { name: value, exact: true }).first().click();
  }

  /** Masked/number inputs need fill + Tab (blur commits the mask). */
  async fillMasked(label: string, value: string): Promise<void> {
    const input = this.fieldRoot(label).locator("input").first();
    await input.click();
    await input.fill(value);
    await this.page.keyboard.press("Tab");
  }

  async fillProcedureReferral(data: ProcedureReferralData): Promise<void> {
    await this.pickProvider("Referring Provider", data.providerNpi);
    await this.pickProvider("Refer To Provider", data.providerNpi);
    // Refer From / Refer To both have "Facility" + "Clinic/Dept." — index 1 = Refer To.
    await this.pickMuiSelect("Facility", data.facility, 1);
    await this.pickMuiSelect("Clinic/Dept.", data.clinicDept, 1);

    await this.pickSearchDropdown("Procedure", data.procedureKeyword, data.procedureMatch);
    await this.fillMasked("Procedure Time (min)", data.procedureTimeMin);
    await this.fillMasked("Turnover Time (min)", data.turnoverTimeMin);
    await this.pickLaterality(data.laterality);

    await this.pickSearchDropdown("Associated DX-ICD-10", data.dxKeyword, data.dxMatch);
    await this.pickSearchDropdown("CPT/Procedure Code", data.cptKeyword, data.cptMatch);
    await this.pickProvider("Surgeon", data.surgeonNpi);
    await this.pickMuiSelect("Service Type", data.serviceType);

    await this.fillMasked("Requested Date and Time", data.requestedDatetime);
    await this.pickMuiSelect("Location", data.location);
    await this.pickMuiSelect("Encounter Type", data.encounterType);

    if (data.procedureReason) {
      const input = this.fieldRoot("Procedure Reason").locator("input").first();
      await input.fill(data.procedureReason);
    }
  }

  async create(): Promise<void> {
    const button = this.page.getByRole("button", { name: "Create Referral", exact: true });
    await expect(button).toBeEnabled({ timeout: 15_000 });
    await button.click();
    await expect(
      this.page.getByText("Referral created successfully.").first()
    ).toBeVisible({ timeout: 20_000 });
  }
}
