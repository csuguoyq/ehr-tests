// src/executor/param-resolver.ts — merge parameter sources and validate
// against the goal's schema. Parameter combinations are DATA, not branches.
//
// Merge priority (highest wins): overrides (CLI/user) > preset > defaults.
// All validation errors are collected and thrown at once — a run must fail at
// the entry point, never halfway through a flow.

import type { GoalDefinition, ParamSchema, ResolvedParams } from "../types/goal";

export interface ResolveInput {
  preset?: string;
  params?: ResolvedParams;
}

/**
 * Type-check AND coerce a parameter value to its schema type. Coercion is
 * lenient about the common string representations (CLI --param is always a
 * string, YAML may yield numbers): numeric string -> number, "true"/"false"
 * -> boolean, number/boolean -> string. Genuinely wrong types (objects,
 * non-numeric strings for a number) still fail fast at the entry point.
 */
function coerceValue(
  name: string,
  value: unknown,
  schema: ParamSchema
): { value: unknown; error: string | null } {
  if (value === null || value === undefined) return { value, error: null };
  const t = schema.type;
  const fail = () => ({
    value,
    error: `参数 ${name} 应为 ${t}，实际为 ${typeof value}: ${JSON.stringify(value)}`,
  });
  if (t === "string") {
    if (typeof value === "string") return { value, error: null };
    if (typeof value === "number" || typeof value === "boolean")
      return { value: String(value), error: null };
    return fail();
  }
  if (t === "number") {
    if (typeof value === "number") return { value, error: null };
    if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value)))
      return { value: Number(value), error: null };
    return fail();
  }
  if (t === "boolean") {
    if (typeof value === "boolean") return { value, error: null };
    if (value === "true") return { value: true, error: null };
    if (value === "false") return { value: false, error: null };
    return fail();
  }
  return { value, error: null };
}

function enumCheck(name: string, value: unknown, schema: ParamSchema): string | null {
  if (value === null || value === undefined || !schema.enum) return null;
  if (!schema.enum.includes(value)) {
    return `参数 ${name}=${JSON.stringify(value)} 不在可选值 [${schema.enum.join(", ")}] 中`;
  }
  return null;
}

export function resolveParams(goal: GoalDefinition, input: ResolveInput = {}): ResolvedParams {
  const errors: string[] = [];
  const resolved: ResolvedParams = {};

  const presetValues = input.preset ? goal.presets?.[input.preset] : undefined;
  if (input.preset && !presetValues) {
    const known = Object.keys(goal.presets || {}).join(", ") || "(none)";
    throw new Error(`目标 ${goal.name} 没有 preset “${input.preset}”，可用：${known}`);
  }

  const overrides = input.params || {};

  // 1) merge: defaults < preset < overrides
  for (const [name, schema] of Object.entries(goal.params)) {
    let value: unknown;
    if (name in overrides) value = overrides[name];
    else if (presetValues && name in presetValues) value = presetValues[name];
    else if (schema.default !== undefined && schema.default !== null) value = schema.default;

    const checked = coerceValue(name, value, schema);
    if (checked.error) errors.push(checked.error);
    const coerced = checked.value;
    const enumErr = enumCheck(name, coerced, schema);
    if (enumErr) errors.push(enumErr);
    resolved[name] = coerced === undefined ? null : coerced;
  }

  // 2) unknown override keys are typos — reject loudly
  for (const key of Object.keys(overrides)) {
    if (!(key in goal.params)) errors.push(`未知参数 ${key}（目标 ${goal.name} 的 schema 中不存在）`);
  }

  // 3) required / requiredIf — evaluated on merged values
  for (const [name, schema] of Object.entries(goal.params)) {
    const missing = resolved[name] === null || resolved[name] === undefined;
    if (!missing) continue;
    if (schema.required) {
      errors.push(`参数 ${name} 必填（目标 ${goal.name}）`);
      continue;
    }
    const cond = schema.requiredIf;
    if (cond) {
      const trigger = resolved[cond.param];
      const active =
        cond.values !== undefined ? cond.values.includes(trigger) : cond.value === trigger;
      if (active) errors.push(`参数 ${name} 在 ${cond.param}=${JSON.stringify(trigger)} 时必填`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`目标 ${goal.name} 参数校验失败（入口一次性报错，不进流程）：\n  - ${errors.join("\n  - ")}`);
  }
  return resolved;
}
