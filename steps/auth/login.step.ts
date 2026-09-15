// steps/auth/login.step.ts — business-atomic login action.
// Validates parameters (fill env defaults for null), calls the Page Object,
// ends on a condition that proves success.

import type { EhrContext } from "../../src/types/ehr-context";
import type { ResolvedParams } from "../../src/types/goal";
import { LoginPage } from "../../page-objects/auth/login.page";

export async function loginStep(ctx: EhrContext, params: ResolvedParams): Promise<void> {
  const username = (params.username as string) || ctx.env.username;
  const password = (params.password as string) || ctx.env.password;

  const login = new LoginPage(ctx.page, ctx.env);
  await login.open();
  await login.dismissWarningIfPresent();
  await login.ensureUsernamePasswordForm();
  ctx.log.step("fill-credentials", `username=${username}`);
  await login.fillCredentials(username, password);
  await login.submit();
  await login.expectLoggedIn();
  ctx.log.info(`logged in as ${username} on ${ctx.env.host}`);
}
