// src/types/flow.ts — a Flow orchestrates Steps toward one business goal.
// Flows must not contain locators; page interaction lives in Page Objects,
// parameter branching lives in Steps (max 3 branches).

import type { EhrContext } from "./ehr-context";
import type { ResolvedParams } from "./goal";

export interface FlowDefinition {
  /** goals.yaml key this flow fulfills. */
  goal: string;
  description?: string;
  execute(ctx: EhrContext, params: ResolvedParams): Promise<void>;
}
