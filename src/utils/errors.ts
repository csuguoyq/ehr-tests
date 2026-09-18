// src/utils/errors.ts — error taxonomy for deterministic, environment-side
// blocks (2026-09-18 review N-item B2).
//
// Throw EnvBlockedError ONLY when the test reached a state that depends on
// the server/box side and that side provably never delivered (wait exhausted
// with remounts/re-polls already applied). It does NOT change the test
// result — the test still fails — it just makes the failure classifiable in
// the report: every env-side block starts with the [ENV-BLOCKED] prefix.

export class EnvBlockedError extends Error {
  constructor(message: string) {
    super(`[ENV-BLOCKED] ${message}`);
    this.name = "EnvBlockedError";
  }
}
