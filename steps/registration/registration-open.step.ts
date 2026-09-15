// steps/registration/registration-open.step.ts — business-atomic action:
// reach the Registration module from the portal rail.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { RegistrationAppPage } from "../../page-objects/registration/registration-app.page";

export async function openRegistrationStep(ctx: EhrContext, _params: ResolvedParams): Promise<void> {
  const app = new RegistrationAppPage(ctx.page, ctx.env);
  ctx.log.step("open-registration", ctx.env.host);
  await app.open("REGISTRATION");
}
