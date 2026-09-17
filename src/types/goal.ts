// src/types/goal.ts — goal declaration types shared by goals.yaml, the
// executor and the status files (GOALS.md). A goal is a natural-language
// addressable business target backed by exactly one Flow.

export type ParamType = "string" | "number" | "boolean";

export interface RequiredIf {
  /** When `param` resolves to `value` (or one of `values`), this param becomes required. */
  param: string;
  value?: unknown;
  values?: unknown[];
}

export interface ParamSchema {
  type: ParamType;
  default?: unknown;
  enum?: unknown[];
  required?: boolean;
  requiredIf?: RequiredIf;
  description?: string;
}

export interface GoalDefinition {
  /** goals.yaml key; injected by loadGoals, may be omitted in declarations. */
  name?: string;
  /** Natural-language aliases, e.g. ["create patient", "log in"]. */
  aliases: string[];
  /** Flow class/registry key that implements this goal. */
  flow: string;
  params: Record<string, ParamSchema>;
  /** Named common parameter combinations. Preset < CLI overrides in priority. */
  presets?: Record<string, Record<string, unknown>>;
  /** Present=false means registered-only (registered in GOALS.md, Flow not yet implemented). */
  implemented?: boolean;
}

export type ResolvedParams = Record<string, unknown>;

export interface GoalsFile {
  goals: Record<string, GoalDefinition>;
}
