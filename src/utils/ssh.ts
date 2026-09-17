// src/utils/ssh.ts — run a command on the target box over SSH (server-side
// TC operations: e.g. a shell script that flips a server-held state mid-TC).
//
// Conventions:
//   - The command NEVER comes from goal params — callers pass an entry of a
//     whitelisted registry (see steps/server/run-script.step.ts). Free-text
//     commands from user input would turn the suite into a remote shell.
//   - Key-based auth must be preconfigured on the test host (BatchMode: no
//     password prompts); a missing/broken setup fails loudly with the SSH
//     stderr attached.
//   - stdout is returned and expected to be attached to the report by the
//     caller (test.info().attach) — it is the failure evidence for the run.

import { execFile } from "child_process";
import type { EhrEnvConfig } from "../types/ehr-context";

export interface SshResult {
  stdout: string;
  /** Rough duration in ms, for the log line. */
  elapsedMs: number;
}

export async function runRemoteCommand(
  env: EhrEnvConfig,
  command: string,
  opts: { timeoutMs?: number } = {}
): Promise<SshResult> {
  if (!env.sshTarget) {
    throw new Error(
      "SSH server-op requested but EHR_SSH_TARGET is not configured (set user@host in .env; key auth must be preconfigured)"
    );
  }
  const started = Date.now();
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      "ssh",
      [
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ConnectTimeout=10",
        env.sshTarget,
        command,
      ],
      { timeout: opts.timeoutMs ?? 120_000, encoding: "utf8", windowsHide: true },
      (err, out, stderr) => {
        if (err) {
          reject(
            new Error(
              `ssh ${env.sshTarget} "${command}" failed: ${err.message}\nstderr: ${stderr.trim()}`
            )
          );
        } else {
          resolve(out);
        }
      }
    );
  });
  return { stdout, elapsedMs: Date.now() - started };
}
