import {
  FINDING_STATUSES,
  ROBOVIEW_OUTCOMES,
} from "../../constants.ts";
import { collectReviewerFindings } from "./collectReviewerFindings.ts";
import { finalizeReviewIteration } from "../finalizeReviewIteration.ts";
import { runPeerReview } from "./runPeerReview.ts";
import { verifyReviewers } from "./helper-functions.ts";
import { buildReviewers } from "./buildReviewers.ts";
import { advanceReviewState } from "./advanceReviewState.ts";
import { applyAuditFixes } from "./applyAuditFixes.ts";
import { buildWorkspaceUnifiedDiff } from "../../system/git.ts";
import { redactText } from "../../redaction.ts";
export { buildReviewers } from "./buildReviewers.ts";

export async function runReviewWorkflow({
  cwd,
  config,
  session,
  diffText,
  docsText,
  auditRuns,
  commitMessages,
  scanIteration,
  includeWorktree,
  docsPath,
  diffBase,
  onApproveImplementationReady,
  onApproveAuditFixes,
  onResolveConflicts,
  onProgress,
  onCheckpoint,
}: {
  cwd: string;
  config: any;
  session: any;
  diffText: string;
  docsText: string;
  auditRuns: any[];
  commitMessages: any[];
  scanIteration: number;
  includeWorktree: boolean;
  docsPath: string | null;
  diffBase: string;
  onApproveImplementationReady?: ((args: { findings: any[] }) => Promise<Map<string, boolean>>) | null;
  onApproveAuditFixes?: ((args: { findings: any[] }) => Promise<Map<string, boolean>>) | null;
  onResolveConflicts?: ((args: { session: any; conflicts: any[] }) => Promise<void>) | null;
  onProgress?: (event: unknown) => void;
  onCheckpoint?: (args: { session: any }) => Promise<void>;
}) {
  const reviewers = buildReviewers(config);
  await verifyReviewers({ reviewers, onProgress });

  // Apply audit fixes first (CodeRabbit-first workflow)
  const auditFixesResult = await applyAuditFixes({
    cwd,
    director: reviewers[0],
    auditRuns,
    auditToolConfigs: config.audit_tools ?? [],
    scanIteration,
    session,
    onProgress,
    onApproveAuditFixes,
  });

  // Track auto-implemented audit findings
  if (auditFixesResult.implemented.length > 0) {
    session.findings.push(...auditFixesResult.implemented);
    if (auditFixesResult.implementation) {
      session.implementation_runs.push({
        phase: "audit_auto_implement",
        implementation: auditFixesResult.implementation,
      });
    }
  }

  // Regenerate diff to include audit fixes in working tree
  // This ensures LLM reviewers see the already-fixed code
  let reviewDiffText = diffText;
  if (auditFixesResult.implemented.length > 0 && !includeWorktree) {
    const updatedDiff = await buildWorkspaceUnifiedDiff({ cwd, diffBase });
    const redactedUpdatedDiff = redactText(updatedDiff);
    reviewDiffText = redactedUpdatedDiff.text;
  }

  const initial = await collectReviewerFindings({
    cwd,
    reviewers,
    diffText: reviewDiffText,
    docsText,
    auditRuns,
    commitMessages,
    existingFindings: session.findings,
    scanIteration,
    session,
    onProgress,
    diffBase,
  });
  session.reviewer_runs.push(
    ...initial.reviewerResults.map(({ reviewer, raw, findings }) => ({
      scan_iteration: scanIteration,
      reviewer_id: reviewer.reviewer_id,
      reviewer_tool: reviewer.tool,
      finding_count: findings.length,
      raw,
    })),
  );
  const findingsAfterPeerReview = await runPeerReview({
    cwd,
    reviewers,
    findings: initial.findings,
    session,
    onProgress,
  });
  const findingsWithOutcomes = findingsAfterPeerReview.map((finding) =>
    finding.roboreview_outcome === ROBOVIEW_OUTCOMES.CONSENSUS
      ? {
          ...finding,
          status: FINDING_STATUSES.IMPLEMENTATION_READY,
        }
      : finding,
  );
  const reviewState = await advanceReviewState({
    cwd,
    config,
    session,
    findings: findingsWithOutcomes,
    auditRuns,
    auditAssessments: initial.auditAssessments,
    rawFindingCount: initial.rawFindingCount,
    scanIteration,
    includeWorktree,
    docsPath,
    onApproveImplementationReady,
    onResolveConflicts,
    onProgress,
    onCheckpoint,
  });
  if (reviewState.paused) {
    return session;
  }

  return finalizeReviewIteration({
    cwd,
    session,
    reviewers,
    finalizedIterationFindings: reviewState.finalizedIterationFindings,
    scanIteration,
    includeWorktree,
    auditRunCount: auditRuns.length,
    reviewerFindingsCount: initial.rawFindingCount,
    onProgress,
    onCheckpoint,
  });
}
