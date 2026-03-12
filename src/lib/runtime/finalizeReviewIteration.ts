import { FINDING_STATUSES, ROBOVIEW_OUTCOMES, SESSION_STATUSES } from "../constants.ts";
import { listReviewScopeFiles } from "../system/git.ts";
import {
  createImplementationRun,
  getImplementationReadyFindings,
  markImplementedFindings,
  WORKFLOW_PHASES,
} from "./workflow-state/index.ts";
import { checkpointSession, emitProgress, replaceFindings, runImplementation } from "./workflow/helper-functions.ts";

export async function finalizeReviewIteration({
  cwd,
  session,
  reviewers,
  finalizedIterationFindings,
  docsText,
  scanIteration,
  includeWorktree,
  auditRuns,
  initial,
  onProgress,
  onCheckpoint,
}) {
  const implementationReady = getImplementationReadyFindings(
    finalizedIterationFindings.filter((finding) => finding.status === FINDING_STATUSES.IMPLEMENTATION_READY),
  );
  emitProgress({
    onProgress,
    message: {
      type: "consensus_summary",
      implementationReady,
      resolved: finalizedIterationFindings.filter((finding) => finding.status === FINDING_STATUSES.RESOLVED),
      nonConsensus: finalizedIterationFindings.filter(
        (finding) =>
          finding.roboreview_outcome === ROBOVIEW_OUTCOMES.NON_CONSENSUS &&
          finding.resolution_status === null,
      ),
    },
  });

  emitProgress({
    onProgress,
    message: `Applying ${implementationReady.length} approved fix(es)`,
  });
  const implementation = await runImplementation({
    cwd,
    director: reviewers[0],
    findings: implementationReady,
    docsText,
    baseRef: "HEAD",
  });
  emitProgress({
    onProgress,
    message: {
      type: "implementation_result",
      filesTouched: implementation.filesTouched,
      findings: implementationReady,
    },
  });

  const implementedFindings = markImplementedFindings({
    findings: finalizedIterationFindings,
    implementationReady,
  });
  session.findings = replaceFindings({
    existingFindings: session.findings,
    nextFindings: implementedFindings,
  });
  session.review_target.changed_files = await listReviewScopeFiles({
    cwd,
    diffBase: session.review_target.diff_base,
    includeWorktree,
  });
  session.iterations.push({
    iteration_num: scanIteration,
    reviewer_findings_count: initial.rawFindingCount,
    new_findings_count: implementedFindings.length,
    consensus_count: implementedFindings.filter((finding) => finding.roboreview_outcome === ROBOVIEW_OUTCOMES.CONSENSUS).length,
    non_consensus_count: implementedFindings.filter((finding) => finding.roboreview_outcome === ROBOVIEW_OUTCOMES.NON_CONSENSUS).length,
    audit_run_count: auditRuns.length,
    include_worktree: includeWorktree,
  });
  session.implementation_runs.push(createImplementationRun({ phase: WORKFLOW_PHASES.REVIEW, implementation }));
  session.cursor = null;
  session.status = SESSION_STATUSES.COMPLETE;
  await checkpointSession({ onCheckpoint, session });
  emitProgress({
    onProgress,
    message: "Review workflow completed",
  });

  return session;
}
