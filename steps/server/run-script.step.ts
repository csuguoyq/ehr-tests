// steps/server/run-script.step.ts — business-atomic server-side operation:
// run ONE whitelisted shell command on the box over SSH and return its stdout.
//
// Add a server op by registering it in SCRIPTS (name -> remote command).
// The registry is the safety boundary: goal params can only select a script
// by name, never carry a raw command to execute.

import { runRemoteCommand } from "../../src/utils/ssh";
import type { EhrContext } from "../../src/types/ehr-context";

/**
 * Whitelisted server-side operations. Register a script here before a flow
 * can call it; keep entries test-specific and idempotent where possible —
 * this is a SHARED physical box, other people's data lives here too.
 */
export const SERVER_SCRIPTS: Record<string, string> = {
  // Commands run in a PLAIN non-interactive shell — no login environment.
  // Rule: each entry sources /etc/.profile first (it establishes the SITE's
  // own environment: EERUN/CCRUN/PATH) and then uses PATH-resolvable names.
  // NEVER hardcode campus path prefixes (/fbch, /fooc, /smh, ...): the layout
  // differs per site, and the profile's PATH is the only reliable indirection
  // (this is exactly how CCI engineers run these commands in a login shell).
  //
  // restart-ruleexecd: restart the rules engine daemon (parent + child);
  // .dosu re-execs as user cis. Verified on fbch34 2026-09-17 ("ruleexecd 1
  // was started", exit 0); profile form verified resolution-only (read-only).
  "restart-ruleexecd": ". /etc/.profile >/dev/null 2>&1; .dosu RESTART_RULEEXECD",
};

/** Run a whitelisted server script; stdout goes to the log AND the caller
 *  (attach it to the report for failure evidence). */
export async function runServerScriptStep(
  ctx: EhrContext,
  scriptName: string
): Promise<string> {
  const command = SERVER_SCRIPTS[scriptName];
  if (!command) {
    throw new Error(
      `server script "${scriptName}" is not whitelisted in steps/server/run-script.step.ts SERVER_SCRIPTS`
    );
  }
  ctx.log.step("server-script", `${scriptName} on ${ctx.env.sshTarget || "(unconfigured)"}`);
  const { stdout, elapsedMs } = await runRemoteCommand(ctx.env, command);
  ctx.log.info(`server script ${scriptName} done in ${elapsedMs}ms: ${stdout.trim().slice(0, 400)}`);
  return stdout;
}

// ---------------------------------------------------------------------------
// ycql — parameterized whitelisted op: run SQL against a patient database
// (ccidb) or a workdir database through the ycql REPL.
//
// Boundary: the SQL text is TEST DATA (same category as values typed into UI
// inputs) and may be any statement ycql accepts — CCI TCs use ad-hoc SQL
// (precedent: TC31453 `echo "update ...; select ...;" | .dosu ycql`). What is
// whitelisted is the SURFACE: SQL can only ever run as user cis, through ycql,
// never as raw shell or sqlite. The TARGET slots are strictly validated:
//   dbpath — patient db short form "volN/pNNNN" (ccidb() form)
//   dbfile — workdir db under $CCRUN/workdir/, e.g. bnrStatus/bnrStatus.db

export interface YcqlArgs {
  /** Patient db short form "volN/pNNNN"; when given, the session first runs
   *  `select ccidb('<dbpath>')` on the default connection. */
  dbpath?: string;
  /** Workdir db relative to $CCRUN/workdir/ (e.g. "bnrStatus/bnrStatus.db");
   *  when given, runs `ycql <dbfile>` instead of the default connection. */
  dbfile?: string;
  /** SQL to execute (may contain multiple statements). Test data — see the
   *  boundary note above; always logged for report evidence. */
  sql: string;
}

const DBPATH_PATTERN = /^vol\d+\/p\d+$/;
const DBFILE_PATTERN = /^[A-Za-z0-9_]+\/[A-Za-z0-9_]+\.db$/;
const SQL_MAX_LEN = 4000;

/** Build the remote ycql command from validated args. The payload carries
 *  real newlines; single quotes inside the SQL are escaped for the shell. */
export function buildYcqlCommand(args: { dbpath?: string; dbfile?: string; sql: string }): string {
  let sql = args.sql.trim();
  if (!/;\s*$/.test(sql)) sql += ";";
  const stmts: string[] = [];
  if (args.dbpath) stmts.push(`select ccidb('${args.dbpath}');`);
  stmts.push(sql);
  const payload = stmts.join("\n").replace(/'/g, "'\\''");
  const dbArg = args.dbfile ? ` $CCRUN/workdir/${args.dbfile}` : "";
  return `. /etc/.profile >/dev/null 2>&1; printf '%s\n' '${payload}' | .dosu ycql${dbArg}`;
}

/** Run SQL via ycql (see the boundary note above). Returns the REPL stdout. */
export async function runYcqlStep(ctx: EhrContext, args: YcqlArgs): Promise<string> {
  if (!args.sql || !args.sql.trim()) throw new Error("runYcqlStep: sql is required");
  if (args.sql.length > SQL_MAX_LEN) throw new Error(`runYcqlStep: sql exceeds ${SQL_MAX_LEN} chars`);
  if (args.dbpath && !DBPATH_PATTERN.test(args.dbpath)) {
    throw new Error(`runYcqlStep: dbpath "${args.dbpath}" must match volN/pNNNN (e.g. vol2/p1650344602)`);
  }
  if (args.dbfile && !DBFILE_PATTERN.test(args.dbfile)) {
    throw new Error(`runYcqlStep: dbfile "${args.dbfile}" must be <dir>/<name>.db under $CCRUN/workdir (e.g. bnrStatus/bnrStatus.db)`);
  }
  const command = buildYcqlCommand(args);
  ctx.log.step("server-ycql", `ycql ${args.dbpath || args.dbfile || "(default connection)"} on ${ctx.env.sshTarget || "(unconfigured)"}`);
  ctx.log.info(`ycql sql: ${args.sql.trim().slice(0, 400)}`);
  const { stdout, elapsedMs } = await runRemoteCommand(ctx.env, command);
  ctx.log.info(`ycql done in ${elapsedMs}ms: ${stdout.trim().slice(0, 400)}`);
  return stdout;
}
