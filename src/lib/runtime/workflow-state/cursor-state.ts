import { CURSOR_PHASES } from "../../constants.ts";

export function createReviewCursorMetadata({
  scanIteration,
  includeWorktree,
  reviewerFindingsCount,
  auditRunCount,
  docsPath,
}: {
  scanIteration: number;
  includeWorktree: boolean;
  reviewerFindingsCount: number;
  auditRunCount: number;
  docsPath: string | null;
}) {
  return {
    scan_iteration: scanIteration,
    include_worktree: includeWorktree,
    reviewer_findings_count: reviewerFindingsCount,
    audit_run_count: auditRunCount,
    docs_path: docsPath,
  };
}

export function createManualConsensusCursor({
  reviewCursor,
  findingIds,
}: {
  reviewCursor: ReturnType<typeof createReviewCursorMetadata>;
  findingIds: string[];
}) {
  return {
    ...reviewCursor,
    phase: CURSOR_PHASES.MANUAL_CONSENSUS_APPROVAL,
    finding_ids: findingIds,
    next_finding_index: 0,
  };
}

export function createConflictResolutionCursor({
  reviewCursor,
  conflictIds,
  nextConflictIndex,
}: {
  reviewCursor: ReturnType<typeof createReviewCursorMetadata>;
  conflictIds: string[];
  nextConflictIndex: number;
}) {
  return {
    ...reviewCursor,
    phase: CURSOR_PHASES.HITL_RESOLUTION,
    conflict_ids: conflictIds,
    next_conflict_index: nextConflictIndex,
  };
}

export function createFinalImplementationCursor({
  reviewCursor,
  conflictIds,
  nextConflictIndex,
}: {
  reviewCursor: ReturnType<typeof createReviewCursorMetadata>;
  conflictIds: string[];
  nextConflictIndex: number;
}) {
  return {
    ...reviewCursor,
    phase: CURSOR_PHASES.FINAL_IMPLEMENTATION,
    conflict_ids: conflictIds,
    next_conflict_index: nextConflictIndex,
  };
}

export function getReviewCursorMetadata(cursor: any) {
  if (
    typeof cursor?.scan_iteration !== "number" ||
    typeof cursor?.include_worktree !== "boolean" ||
    typeof cursor?.reviewer_findings_count !== "number" ||
    typeof cursor?.audit_run_count !== "number"
  ) {
    return null;
  }

  return {
    scanIteration: cursor.scan_iteration,
    includeWorktree: cursor.include_worktree,
    reviewerFindingsCount: cursor.reviewer_findings_count,
    auditRunCount: cursor.audit_run_count,
    docsPath: cursor.docs_path ?? null,
  };
}
