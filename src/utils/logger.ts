// src/utils/logger.ts — minimal console logger with step markers.
// Failure artifacts (trace/screenshot) are configured at the Playwright level;
// this logger is for run narration so a human can follow the flow in output.

export interface Logger {
  step(name: string, message?: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(scope: string): Logger {
  const p = (msg: string) => console.log(`[ehr:${scope}] ${msg}`);
  return {
    step: (name, message) => p(`▶ ${name}${message ? ` — ${message}` : ""}`),
    info: (msg) => p(msg),
    warn: (msg) => p(`⚠ ${msg}`),
    error: (msg) => p(`✖ ${msg}`),
  };
}
