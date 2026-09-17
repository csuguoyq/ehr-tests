// src/utils/retry.ts — the one retry policy for flaky ExtJS interactions:
// an action is only retried when a preceding attempt failed to take effect,
// and each retry must be PROVEN by an observable state check, never blind.
// (Framework review 2026-09-17 §2.1: "click -> verify state -> retry" was
// hand-rolled in 6 places; new code uses this primitive instead.)

/** How long to wait after each action attempt before re-proving, ms. */
export const RETRY_SETTLE_MS = 1_500;

/**
 * Run `action`, then check `prove`. If the proof fails, retry up to
 * `attempts` times total. Throws with `desc` once every attempt is spent.
 * The action's return value is passed to `prove` so the proof can inspect
 * what the action actually did.
 */
export async function retryUntil<T>(
  action: () => Promise<T>,
  prove: (result: T) => Promise<boolean>,
  desc: string,
  attempts = 3,
  settleMs = RETRY_SETTLE_MS
): Promise<T> {
  let last: T | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    last = await action();
    if (await prove(last)) return last;
    if (attempt < attempts) await new Promise((r) => setTimeout(r, settleMs));
  }
  throw new Error(`retryUntil exhausted (${attempts} attempts): ${desc}`);
}
