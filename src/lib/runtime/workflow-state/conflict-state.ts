import {
  CONFLICT_STATUSES,
  DECIDED_BY,
  FINDING_STATUSES,
  RESOLUTION_STATUSES,
  ROBOVIEW_OUTCOMES,
} from "../../constants.ts";
import { conflictId } from "../../ids.ts";

export function getCursorConflicts({ session }: { session: any }) {
  const conflictIds = Array.isArray(session.cursor?.conflict_ids)
    ? session.cursor.conflict_ids
    : [];
  const conflictIdSet = new Set(conflictIds);
  return session.conflicts.filter((conflict) =>
    conflictIdSet.has(conflict.conflict_id),
  );
}

export function createConflicts({
  findings,
  startIndex = 0,
}: {
  findings: any[];
  startIndex?: number;
}) {
  return findings
    .filter(
      (finding) =>
        finding.roboreview_outcome === ROBOVIEW_OUTCOMES.NON_CONSENSUS,
    )
    .map((finding, index) => ({
      conflict_id: conflictId(startIndex + index + 1),
      finding_id: finding.finding_id,
      status: CONFLICT_STATUSES.UNRESOLVED,
      human_decision: null,
    }));
}

export function applyConflictResolutionDecisions({
  findings,
  conflicts,
}: {
  findings: any[];
  conflicts: any[];
}) {
  const implementIds = new Set(
    conflicts
      .filter(
        (conflict) =>
          conflict.human_decision === "implement_disputed_recommendation",
      )
      .map((conflict) => conflict.finding_id),
  );

  return findings.map((finding) => {
    if (finding.roboreview_outcome !== ROBOVIEW_OUTCOMES.NON_CONSENSUS) {
      return finding;
    }

    if (implementIds.has(finding.finding_id)) {
      return {
        ...finding,
        decided_by: DECIDED_BY.USER,
        resolution_status: null,
        status: FINDING_STATUSES.IMPLEMENTATION_READY,
      };
    }

    return {
      ...finding,
      decided_by: DECIDED_BY.USER,
      resolution_status: RESOLUTION_STATUSES.DISCARDED,
      status: FINDING_STATUSES.RESOLVED,
    };
  });
}

export function getNextPendingConflictIndex(conflicts: any[]) {
  return conflicts.findIndex(
    (conflict) => conflict.status !== CONFLICT_STATUSES.RESOLVED,
  );
}

export function resolveConflicts(conflicts: any[]) {
  return conflicts.map((conflict) => ({
    ...conflict,
    status: CONFLICT_STATUSES.RESOLVED,
  }));
}
