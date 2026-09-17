// src/executor/goal-matcher.ts — match a natural-language user input to a
// goal declared in goals.yaml. Pure string matching, no AI at runtime.
//
// Match quality ladder: exact goal name > exact alias > containment (input
// contains alias, or alias contains input) > token overlap score.

import type { GoalDefinition, GoalsFile } from "../types/goal";

export interface GoalMatch {
  goal: GoalDefinition;
  matchedBy: string;
  score: number;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[,.!?]/g, "").replace(/_/g, " ");
}

function tokens(s: string): string[] {
  return normalize(s).split(/\s+/).filter(Boolean);
}

function tokenOverlap(input: string, candidate: string): number {
  const a = new Set(tokens(input));
  const b = new Set(tokens(candidate));
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.max(a.size, b.size);
}

export function matchGoal(input: string, goals: Record<string, GoalDefinition>): GoalMatch {
  const norm = normalize(input);
  const candidates: GoalMatch[] = [];

  for (const [key, goalDef] of Object.entries(goals)) {
    // goals.yaml identifies goals by key; declarations without a name field are tolerated.
    const goal: GoalDefinition = { name: key, ...goalDef };
    const goalName = goal.name || key;
    const tryPush = (candidate: string, matchedBy: string, base: number) => {
      const c = normalize(candidate);
      let score = 0;
      if (c === norm) score = base + 100;
      else if (norm.includes(c) && c.length >= 2) score = base + 50 + c.length / norm.length * 10;
      else if (c.includes(norm) && norm.length >= 2) score = base + 30;
      else score = tokenOverlap(input, candidate) * base;
      if (score > 0) candidates.push({ goal, matchedBy, score });
    };
    tryPush(goalName, `goal:${goalName}`, 80);
    for (const alias of goal.aliases) tryPush(alias, `alias:"${alias}"`, 60);
  }

  if (candidates.length === 0) {
    const known = Object.keys(goals).join(", ");
    throw new Error(`Unable to match goal: "${input}". Registered goals: ${known || "(none)"}`);
  }

  candidates.sort((x, y) => y.score - x.score);
  const [best, second] = candidates;
  if (second && second.goal.name !== best.goal.name && Math.abs(best.score - second.score) < 1) {
    throw new Error(
      `Ambiguous match for "${input}": ${best.goal.name} vs ${second.goal.name} — use a more specific phrase or --preset`
    );
  }
  return best;
}
