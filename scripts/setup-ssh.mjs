// scripts/setup-ssh.mjs — one-time SSH key bootstrap for server ops.
//
// Lets a test machine onboard to a CCI box with ONLY .env config:
//   EHR_SSH_TARGET=user@host   (required)
//   EHR_SSH_PASS=password      (bootstrap only; safe to remove afterwards)
//
// What it does (idempotent, safe to re-run):
//   1. Probe key auth (BatchMode). Already works -> done.
//   2. Reuse or generate ~/.ssh/id_rsa_automation (no passphrase).
//   3. Install the public key via a ONE-TIME password login (ssh2, in-memory
//      only — never appears on a command line or process list).
//   4. Sanity-check server-side permissions (sshd StrictModes).
//   5. Patch local ~/.ssh/config with IdentityFile so the runtime path
//      (src/utils/ssh.ts, plain `ssh <target>`) picks the key up.
//   6. Re-probe key auth; only then report success.
//
// Limitation: the box must allow password login for the user. If sshd has
// PasswordAuthentication disabled, key installation cannot be automated.
// The RUNTIME path never uses the password — it stays key-only BatchMode.

import { execFileSync, execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const require = createRequire(import.meta.url);
const dotenv = require("dotenv");

const SSH_DIR = join(homedir(), ".ssh").split(sep).join("/");
const KEY_PATH = join(SSH_DIR, "id_rsa_automation").split(sep).join("/");
const PUB_PATH = KEY_PATH + ".pub";
const CONFIG_PATH = join(SSH_DIR, "config").split(sep).join("/");

function fail(msg) {
  console.error(`[setup:ssh] FAIL: ${msg}`);
  process.exit(1);
}

function sshBatchArgs(target, probeCommand) {
  return [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
    "-o", `IdentityFile=${KEY_PATH}`,
    target,
    probeCommand,
  ];
}

function probeKeyAuth(target) {
  return new Promise((resolve) => {
    execFile("ssh", sshBatchArgs(target, "id"), { encoding: "utf8", windowsHide: true }, (err, out, errOut) => {
      resolve({ ok: !err, out, errOut });
    });
  });
}

// One-time password login; runs command(s) on the box, returns combined stdout.
function passwordExec(target, password, commands) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { conn.end(); reject(new Error("password login timed out (30s)")); }, 30000);
    conn.on("ready", () => {
      conn.exec(commands, (err, stream) => {
        if (err) { clearTimeout(timer); conn.end(); reject(err); return; }
        stream.on("close", () => { clearTimeout(timer); conn.end(); resolve({ stdout, stderr }); });
        stream.on("data", (d) => { stdout += d; });
        stream.stderr.on("data", (d) => { stderr += d; });
        stream.on("error", (e) => { clearTimeout(timer); conn.end(); reject(e); });
      });
    });
    conn.on("error", (err) => { clearTimeout(timer); reject(err); });
    const [user, hostPart] = target.split("@");
    const [host, port] = hostPart.includes(":") ? hostPart.split(":") : [hostPart, 22];
    // No host-key verification here: this is a one-time bootstrap over a
    // password channel; the runtime key path pins the host key via known_hosts.
    conn.connect({ host, port: Number(port), username: user, password });
  });
}

function ensureKey() {
  if (existsSync(KEY_PATH)) return;
  mkdirSync(SSH_DIR, { recursive: true });
  console.log(`[setup:ssh] generating ${KEY_PATH} (no passphrase)`);
  execFileSync("ssh-keygen", ["-t", "rsa", "-b", "4096", "-f", KEY_PATH, "-N", ""], { stdio: "inherit" });
}

function parseTarget(target) {
  const [user, hostPart] = target.split("@");
  if (!user || !hostPart) fail(`EHR_SSH_TARGET must be user@host (got "${target}")`);
  const [host, port] = hostPart.includes(":") ? hostPart.split(":") : [hostPart, "22"];
  return { user, host, port: Number(port) };
}

// Insert/patch IdentityFile for the target's host block in ~/.ssh/config.
// Returns the new file content, or null when the entry already exists.
function patchConfig(host, user) {
  const lines = existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, "utf8").split("\n") : [];
  // normalize for comparison: backslashes, case, and ~ expansion
  const norm = (s) => s.trim().replace(/\//g, sep).toLowerCase().replace(`~${sep}`, `${homedir().toLowerCase()}${sep}`);
  const want = `    IdentityFile ${KEY_PATH}`;
  const hostIdx = lines.findIndex((l) => l.trim().toLowerCase().startsWith("host ") && l.trim().split(/\s+/).includes(host.toLowerCase()));
  if (hostIdx === -1) {
    lines.push("", `Host ${host}`, `    User ${user}`, want);
    return lines.join("\n");
  }
  // block end = next Host line or EOF
  let end = lines.length;
  for (let i = hostIdx + 1; i < lines.length; i++) {
    if (lines[i].trim().toLowerCase().startsWith("host ")) { end = i; break; }
  }
  if (lines.slice(hostIdx, end).some((l) => norm(l) === norm(want))) return null;
  lines.splice(hostIdx + 1, 0, want);
  return lines.join("\n");
}

async function main() {
  dotenv.config({ path: join(fileURLToPath(new URL("..", import.meta.url)), ".env") });
  // Address follows EHR_HOST; the user writes the box OS account + password.
  // EHR_SSH_TARGET overrides (custom port / non-default address).
  const target =
    process.env.EHR_SSH_TARGET ||
    (process.env.EHR_SSH_USER && process.env.EHR_HOST ? `${process.env.EHR_SSH_USER}@${process.env.EHR_HOST}` : "");
  const password = process.env.EHR_SSH_PASS;
  if (!target) fail("set EHR_SSH_USER in .env (address = EHR_HOST), or EHR_SSH_TARGET for a custom target");
  const { user, host, port } = parseTarget(target);

  console.log(`[setup:ssh] target = ${target}`);

  // 1) idempotent probe
  ensureKey();
  const first = await probeKeyAuth(target);
  if (first.ok) {
    console.log(`[setup:ssh] key auth already works: ${first.out.trim()}`);
    return;
  }

  if (!password) fail("key auth not configured and EHR_SSH_PASS is missing — set it in .env (bootstrap only) and re-run");

  // 2) install pubkey over the one-time password channel
  const pub = readFileSync(PUB_PATH, "utf8").trim();
  // ls -ld (not stat -c): the box stat lacks -c support
  const installCmd =
    `mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh" ` +
    `&& touch "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys" ` +
    `&& (grep -qF '${pub}' "$HOME/.ssh/authorized_keys" && echo ALREADY_INSTALLED || (echo '${pub}' >> "$HOME/.ssh/authorized_keys" && echo INSTALLED)) ` +
    `&& ls -ld "$HOME" "$HOME/.ssh" "$HOME/.ssh/authorized_keys"`;
  console.log("[setup:ssh] installing public key via one-time password login...");
  const res = await passwordExec(target, password, installCmd);
  console.log(`[setup:ssh] remote: ${res.stdout.trim()}`);
  if (res.stderr.trim()) console.warn(`[setup:ssh] remote stderr: ${res.stderr.trim()}`);
  if (!res.stdout.includes("INSTALLED") && !res.stdout.includes("ALREADY_INSTALLED")) {
    fail(`key install did not complete (remote output above)`);
  }

  // 3) strict-modes sanity (warning only; the final probe is the gate).
  // ls -ld line: PERMS NLINK OWNER GROUP ... PATH; perms[4..6]=group, [7..9]=other.
  // Remote home is /home/<user> — match the ssh user, not the local one.
  for (const line of res.stdout.trim().split("\n")) {
    const m = line.match(/^([drwxsStT-]{9,12})\b.*\s(\S+)$/);
    if (!m) continue;
    const [, perms, path] = m;
    const groupWritable = perms[6] === "w";
    const otherWritable = perms[9] === "w";
    if (path.endsWith("/" + user) && (groupWritable || otherWritable)) {
      console.warn(`[setup:ssh] WARNING: remote home dir ${perms} is group/other writable — sshd StrictModes will reject key auth (run: chmod 755 ${path} on the box)`);
    }
    if (path.endsWith("/.ssh") && perms.slice(4) !== "------") console.warn(`[setup:ssh] note: ~/.ssh perms ${perms} (expected drwx------)`);
  }

  // 4) patch local config so plain `ssh <target>` uses the key
  const patched = patchConfig(host, user);
  if (patched !== null) {
    writeFileSync(CONFIG_PATH, patched);
    console.log(`[setup:ssh] patched ${CONFIG_PATH} (IdentityFile for host ${host})`);
  } else {
    console.log(`[setup:ssh] ${CONFIG_PATH} already has the IdentityFile entry`);
  }

  // 5) final gate: key auth must now work
  const second = await probeKeyAuth(target);
  if (!second.ok) {
    fail(`key auth still fails after install: ${second.errOut.trim()}`);
  }
  console.log(`[setup:ssh] OK: passwordless key auth verified — ${second.out.trim()}`);
  console.log(`[setup:ssh] you may now remove EHR_SSH_PASS from .env (runtime never uses it)`);
}

main().catch((e) => fail(e.message));
