import {
  FINDING_STATUSES,
  ROBOVIEW_OUTCOMES,
  SESSION_STATUSES,
} from "../../constants.ts";
import { listReviewScopeFiles } from "../../system/git.ts";
import {
  applyConflictResolutionDecisions,
  applyConsensusApprovalDecisions,
  buildTrackedAuditFindings,
  createConflictResolutionCursor,
  createConflicts,
  createFinalImplementationCursor,
  createManualConsensusCursor,
  createReviewCursorMetadata,
  getNextPendingConflictIndex,
  resolveConflicts,
} from "../workflow-state/index.ts";
import {
  checkpointSession,
  emitProgress,
  replaceFindings,
} from "./helper-functions.ts";

export async function advanceReviewState({
  cwd,
  config,
  session,
  findings,
  auditRuns,
  auditAssessments,
  rawFindingCount,
  scanIteration,
  includeWorktree,
  docsPath,
  onApproveImplementationReady,
  onResolveConflicts,
  onProgress,
  onCheckpoint,
}) {
  session.audit_findings.push(
    ...buildTrackedAuditFindings({
      auditFindings: auditRuns.flatMap((run) => run.findings ?? []),
      findings,
      auditAssessments,
    }),
  );
  session.findings.push(...findings);
  session.review_target.changed_files = await listReviewScopeFiles({
    cwd,
    diffBase: session.review_target.diff_base,
    includeWorktree,
  });
  await checkpointSession({ onCheckpoint, session });

  const reviewCursor = createReviewCursorMetadata({
    scanIteration,
    includeWorktree,
    reviewerFindingsCount: rawFindingCount,
    auditRunCount: auditRuns.length,
    docsPath,
  });

  let finalizedIterationFindings = await resolveConsensusApprovals({
    config,
    session,
    findings,
    reviewCursor,
    onApproveImplementationReady,
    onCheckpoint,
  });
  session.findings = replaceFindings({
    existingFindings: session.findings,
    nextFindings: finalizedIterationFindings,
  });
  session.status = SESSION_STATUSES.RUNNING;
  await checkpointSession({ onCheckpoint, session });

  const conflictResult = await resolveWorkflowConflicts({
    session,
    finalizedIterationFindings,
    reviewCursor,
    onResolveConflicts,
    onProgress,
    onCheckpoint,
  });
  if (conflictResult.paused) {
    return {
      finalizedIterationFindings,
      paused: true,
    };
  }

  finalizedIterationFindings = conflictResult.finalizedIterationFindings;
  session.findings = replaceFindings({
    existingFindings: session.findings,
    nextFindings: finalizedIterationFindings,
  });
  session.status = SESSION_STATUSES.RUNNING;
  await checkpointSession({ onCheckpoint, session });
  return {
    finalizedIterationFindings,
    paused: false,
  };
}

async function resolveConsensusApprovals({
  config,
  session,
  findings,
  reviewCursor,
  onApproveImplementationReady,
  onCheckpoint,
}) {
  const consensusApprovalFindingIds = findings
    .filter((finding) => finding.status === FINDING_STATUSES.IMPLEMENTATION_READY)
    .map((finding) => finding.finding_id);
  let consensusDecisions = new Map<string, boolean>();
  if (
    typeof onApproveImplementationReady === "function" &&
    consensusApprovalFindingIds.length > 0
  ) {
    session.cursor = createManualConsensusCursor({
      reviewCursor,
      findingIds: consensusApprovalFindingIds,
    });
    session.status = SESSION_STATUSES.PAUSED;
    await checkpointSession({ onCheckpoint, session });
    consensusDecisions = await onApproveImplementationReady({ findings });
  }

  return applyConsensusApprovalDecisions({
    findings,
    approvalByFindingId: consensusDecisions,
    autoUpdate: config.autoUpdate,
  });
}

async function resolveWorkflowConflicts({
  session,
  finalizedIterationFindings,
  reviewCursor,
  onResolveConflicts,
  onProgress,
  onCheckpoint,
}) {
  const conflicts = createConflicts({
    findings: finalizedIterationFindings,
    startIndex: session.conflicts.length,
  });
  session.conflicts.push(...conflicts);
  if (conflicts.length === 0) {
    return {
      finalizedIterationFindings,
      paused: false,
    };
  }

  session.cursor = createConflictResolutionCursor({
    reviewCursor,
    conflictIds: conflicts.map((conflict) => conflict.conflict_id),
    nextConflictIndex: getNextPendingConflictIndex(session.conflicts),
  });
  session.status = SESSION_STATUSES.PAUSED;
  await checkpointSession({ onCheckpoint, session });

  if (typeof onResolveConflicts !== "function") {
    emitProgress({
      onProgress,
      message: `Review paused with ${conflicts.length} conflict(s) awaiting user resolution`,
    });
    return {
      finalizedIterationFindings,
      paused: true,
    };
  }

  await onResolveConflicts({ session, conflicts });
  const resolvedFindings = applyConflictResolutionDecisions({
    findings: finalizedIterationFindings,
    conflicts,
  });
  session.conflicts = resolveConflicts(session.conflicts);
  session.cursor = createFinalImplementationCursor({
    reviewCursor,
    conflictIds: conflicts.map((conflict) => conflict.conflict_id),
    nextConflictIndex: session.conflicts.length,
  });
  return {
    finalizedIterationFindings: resolvedFindings,
    paused: false,
  };
}
