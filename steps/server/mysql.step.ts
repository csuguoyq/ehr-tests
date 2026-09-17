// steps/server/mysql.step.ts — run SQL through the box's MySQL client
// (category 4 of the server-op surface).
//
// Boundary: SQL is TEST DATA (same category as ycql SQL). The wrapper builds
// `$MYSQL_HOME/bin/mysql` (env from /etc/.profile) with explicit connection
// slots — no credentials are inferred or hardcoded:
//   user/password/db/host are validated and quoted; the password appears in
//   the remote process list only for the duration of the call (shared box).
// -N (skip column headers) keeps output parseable; single-quote escaping
// handles quotes inside the SQL.

import { runRemoteCommand } from "../../src/utils/ssh";
import type { EhrContext } from "../../src/types/ehr-context";

const MAX_SQL_LEN = 4000;
const NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const HOST_PATTERN = /^(localhost|127\.0\.0\.1|\d{1,3}(\.\d{1,3}){3}|[A-Za-z0-9.-]+)$/;

export interface MysqlArgs {
  /** SQL to execute (test data; may contain multiple statements). */
  sql: string;
  /** Database name (optional; validated identifier). */
  db?: string;
  /** MySQL user (validated identifier). */
  user?: string;
  /** MySQL password (used as -p'...'; see header note on the shared box). */
  password?: string;
  /** Server host (default: local socket). */
  host?: string;
}

export async function runMysqlStep(ctx: EhrContext, args: MysqlArgs): Promise<string> {
  let sql = args.sql.trim();
  if (!sql) throw new Error("runMysqlStep: sql is required");
  if (sql.length > MAX_SQL_LEN) throw new Error(`runMysqlStep: sql exceeds ${MAX_SQL_LEN} chars`);
  if (!/;\s*$/.test(sql)) sql += ";";
  if (args.db && !NAME_PATTERN.test(args.db)) throw new Error(`runMysqlStep: invalid db name "${args.db}"`);
  if (args.user && !NAME_PATTERN.test(args.user)) throw new Error(`runMysqlStep: invalid user "${args.user}"`);
  if (args.host && !HOST_PATTERN.test(args.host)) throw new Error(`runMysqlStep: invalid host "${args.host}"`);

  const quotedSql = sql.replace(/'/g, "'\\''");
  const flags = [
    args.host ? `-h ${args.host}` : "",
    args.user ? `-u ${args.user}` : "",
    args.password ? `-p'${args.password}'` : "",
    "-N",
    args.db ? args.db : "",
  ]
    .filter(Boolean)
    .join(" ");
  const command = `. /etc/.profile >/dev/null 2>&1; $MYSQL_HOME/bin/mysql ${flags} -e '${quotedSql}'`;

  ctx.log.step("server-mysql", `mysql ${args.db || "(no db)"} on ${ctx.env.sshTarget || "(unconfigured)"}`);
  ctx.log.info(`mysql sql: ${sql.slice(0, 400)}`);
  const { stdout, elapsedMs } = await runRemoteCommand(ctx.env, command);
  ctx.log.info(`mysql done in ${elapsedMs}ms: ${stdout.trim().slice(0, 400)}`);
  return stdout;
}
