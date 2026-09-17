// steps/server/shell.step.ts — free-form LINUX command / executable-script
// execution on the box (categories 1+2 of the server-op surface).
//
// Boundary: the command string is TEST DATA (part of the TC definition, same
// category as ycql SQL — see run-script.step.ts). Execution constraints:
//   - runs as EHR_SSH_USER (NOT cis); escalate with `.dosu` inside the command
//     (CCI convention), never with sudo — sudo is rejected outright
//   - the CCI login environment is sourced first, so $CCRUN/$EERUN/PATH work
//     and campus path prefixes stay implicit (portable across sites)
//   - single command, output captured and logged as report evidence
//
// Named, frequently-used scripts belong in SERVER_SCRIPTS (static registry);
// anything else (one-off ps/grep/kill, any box script, daemons RESTART_*)
// runs through runShellStep.

import { runRemoteCommand } from "../../src/utils/ssh";
import type { EhrContext } from "../../src/types/ehr-context";

const MAX_CMD_LEN = 2000;

export interface ShellArgs {
  /** Shell command to run (test data; may reference CCI env vars). */
  command: string;
  /** Override the remote timeout (default 120s in src/utils/ssh.ts). */
  timeoutMs?: number;
}

export async function runShellStep(ctx: EhrContext, args: ShellArgs): Promise<string> {
  const command = args.command.trim();
  if (!command) throw new Error("runShellStep: command is required");
  if (command.length > MAX_CMD_LEN) throw new Error(`runShellStep: command exceeds ${MAX_CMD_LEN} chars`);
  if (/(^|\s)sudo(\s|$)/.test(command)) {
    throw new Error("runShellStep: sudo is not allowed — use .dosu (CCI convention) for cis elevation");
  }
  ctx.log.step("server-shell", `${ctx.env.sshTarget || "(unconfigured)"}`);
  ctx.log.info(`shell command: ${command.slice(0, 400)}`);
  const { stdout, elapsedMs } = await runRemoteCommand(
    ctx.env,
    `. /etc/.profile >/dev/null 2>&1; ${command}`,
    { timeoutMs: args.timeoutMs }
  );
  ctx.log.info(`shell done in ${elapsedMs}ms: ${stdout.trim().slice(0, 400)}`);
  return stdout;
}
