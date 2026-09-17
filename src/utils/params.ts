// src/utils/params.ts — helpers for resolving declared goal params.

/** Return the value when it is a non-empty string, else the fallback. */
export const str = (v: unknown, fallback: string): string =>
  typeof v === "string" && v ? v : fallback;
