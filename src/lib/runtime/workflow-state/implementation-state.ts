import { IMPLEMENTATION_PHASES } from "../../constants.ts";

export function createImplementationRun({
  phase,
  implementation,
}: {
  phase: string;
  implementation: { filesTouched: string[]; raw: string };
}) {
  return {
    phase,
    files_touched: implementation.filesTouched,
    raw: implementation.raw,
  };
}

export const WORKFLOW_PHASES = {
  REVIEW: IMPLEMENTATION_PHASES.REVIEW,
  RESOLVE: IMPLEMENTATION_PHASES.RESOLVE,
} as const;
