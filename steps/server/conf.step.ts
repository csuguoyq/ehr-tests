// steps/server/conf.step.ts — read / copy / edit CCI config files
// (category 5 of the server-op surface, e.g. TC34183-style rule.rcf setup).
//
// Boundary: paths are restricted to the CCI env roots ($CCRUN, $EERUN,
// $CCSYSDIR) — never /etc, /home, /tmp, and no `..`. The pattern is checked on
// the LITERAL arg (e.g. "$CCRUN/conf/..."); the remote shell expands the var
// after /etc/.profile is sourced.
//   - readConf: plain cat as EHR_SSH_USER (conf files are group-readable)
//   - copyConf: `.dosu cp` (cis) with an automatic .bak.<timestamp> backup
//     of the target when it exists
//   - editConf: ONE `s///` substitution via `.dosu sed -i` (cis); search/
//     replace are escaped for sed — no arbitrary sed expressions
// Every operation logs file + (for edits) the search/replace pair.

import { runRemoteCommand } from "../../src/utils/ssh";
import type { EhrContext } from "../../src/types/ehr-context";

const CONF_PATH_PATTERN = /^\$(CCRUN|EERUN|CCSYSDIR)\/[A-Za-z0-9_.\/-]+$/;
const MAX_EDIT_LEN = 200;

function assertConfPath(value: string, label: string) {
  if (!CONF_PATH_PATTERN.test(value)) {
    throw new Error(`conf op: ${label} "${value}" must be a $CCRUN/$EERUN/$CCSYSDIR path (no /etc, /home, /tmp, ..)`);
  }
}

function sedEscape(s: string): string {
  return s.replace(/[\\/&]/g, (c) => `\\${c}`);
}

export interface ReadConfArgs {
  /** Config file, e.g. "$CCRUN/conf/rule/ruleexecd.rcf". */
  file: string;
  /** Optional substring filter (grep) instead of full cat. */
  grep?: string;
}

// NOTE: conf paths are deliberately UNQUOTED in the command — the pattern
// admits no spaces/metacharacters, and the leading $ROOT must stay expandable
// by the remote shell (single quotes would make it a literal).
/** Read a config file (or grep one line out of it) — read-only. */
export async function readConf(ctx: EhrContext, args: ReadConfArgs): Promise<string> {
  assertConfPath(args.file, "file");
  const filter = args.grep ? ` | grep -- '${args.grep.replace(/'/g, "'\\''")}'` : "";
  const command = `. /etc/.profile >/dev/null 2>&1; cat ${args.file}${filter}`;
  ctx.log.step("server-conf", `read ${args.file}`);
  const { stdout, elapsedMs } = await runRemoteCommand(ctx.env, command);
  ctx.log.info(`conf read done in ${elapsedMs}ms: ${stdout.trim().slice(0, 400)}`);
  return stdout;
}

export interface CopyConfArgs {
  /** Source, e.g. a .template file. */
  from: string;
  /** Target (existing target is backed up to <target>.bak.<timestamp>). */
  to: string;
}

/** Copy a config file (template -> live) as cis. */
export async function copyConf(ctx: EhrContext, args: CopyConfArgs): Promise<string> {
  assertConfPath(args.from, "from");
  assertConfPath(args.to, "to");
  const command =
    `. /etc/.profile >/dev/null 2>&1; ` +
    `if [ -f ${args.to} ]; then .dosu cp -f ${args.to} ${args.to}.bak.$(date +%Y%m%d%H%M%S); fi; ` +
    `.dosu cp -f ${args.from} ${args.to} && echo COPIED`;
  ctx.log.step("server-conf", `copy ${args.from} -> ${args.to}`);
  const { stdout, elapsedMs } = await runRemoteCommand(ctx.env, command);
  ctx.log.info(`conf copy done in ${elapsedMs}ms: ${stdout.trim().slice(0, 200)}`);
  return stdout;
}

export interface EditConfArgs {
  /** Config file to edit in place. */
  file: string;
  /** Literal search string (one `s///` substitution). */
  search: string;
  /** Literal replacement string. */
  replace: string;
}

/** Edit ONE value in a config file via a single sed s/// as cis. */
export async function editConf(ctx: EhrContext, args: EditConfArgs): Promise<string> {
  assertConfPath(args.file, "file");
  for (const [label, v] of [["search", args.search], ["replace", args.replace]] as const) {
    if (!v || v.length > MAX_EDIT_LEN) throw new Error(`conf edit: ${label} must be 1..${MAX_EDIT_LEN} chars`);
  }
  const expr = `s/${sedEscape(args.search)}/${sedEscape(args.replace)}/`;
  const command = `. /etc/.profile >/dev/null 2>&1; .dosu sed -i '${expr}' ${args.file} && echo EDITED`;
  ctx.log.step("server-conf", `edit ${args.file}: ${args.search} -> ${args.replace}`);
  const { stdout, elapsedMs } = await runRemoteCommand(ctx.env, command);
  ctx.log.info(`conf edit done in ${elapsedMs}ms: ${stdout.trim().slice(0, 200)}`);
  return stdout;
}
