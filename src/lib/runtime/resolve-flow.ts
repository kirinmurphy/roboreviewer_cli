import { CONFLICT_STATUSES, CURSOR_PHASES, HUMAN_DECISIONS } from "../constants.ts";
import {
  formatConflictHeader,
  formatLabel,
  formatLocation,
} from "../output/review-output/helper-functions.ts";

export const RESOLUTION_OPTION_LABELS = {
  IMPLEMENT: "Implement Disputed Recommendation",
  DISCARD: "Discard Disputed Recommendation",
} as const;

export function hasPendingConflict(session: any) {
  return (
    session.cursor &&
    session.cursor.phase === CURSOR_PHASES.HITL_RESOLUTION &&
    session.cursor.next_conflict_index < session.conflicts.length
  );
}

export function formatConflictPrompt({
  index,
  total,
  fallbackId,
  finding,
}: {
  index: number;
  total: number;
  fallbackId: string;
  finding: any;
}) {
  const displayFinding = finding ?? {
    finding_id: fallbackId,
    location: null,
    summary: fallbackId,
    recommendation: null,
  };
  const lines = [
    "",
    formatConflictHeader({
      index,
      total,
      findingId: displayFinding.finding_id ?? fallbackId,
    }),
    formatLocation({ finding: displayFinding }),
    displayFinding.summary ?? fallbackId,
  ];

  if (displayFinding.recommendation) {
    lines.push(
      `${formatLabel({ label: "Recommendation" })} ${displayFinding.recommendation}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function mapResolutionDecision({ decision }: { decision: string }) {
  return decision === RESOLUTION_OPTION_LABELS.IMPLEMENT
    ? HUMAN_DECISIONS.IMPLEMENT_DISPUTED_RECOMMENDATION
    : HUMAN_DECISIONS.DISCARD_DISPUTED_RECOMMENDATION;
}

export function isResolvedConflict(conflict: any) {
  return conflict.status === CONFLICT_STATUSES.RESOLVED;
}
