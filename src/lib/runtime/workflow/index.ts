import {
  CONFLICT_STATUSES,
  CURSOR_PHASES,
  FINDING_STATUSES,
  REVIEWER_IDS,
  REVIEWER_ROLES,
  ROBOVIEW_OUTCOMES,
  SESSION_STATUSES,
} from "../../constants.ts";
import { createAdapter } from "../../adapters/index.ts";
import { listReviewScopeFiles } from "../../system/git.ts";
import { collectReviewerFindings } from "./collectReviewerFindings.ts";
import { finalizeReviewIteration } from "../finalizeReviewIteration.ts";
import { runPeerReview } from "./runPeerReview.ts";
import {
  applyConflictResolutionDecisions,
  applyConsensusApprovalDecisions,
  buildTrackedAuditFindings,
  createConflicts,
  getNextPendingConflictIndex,
  resolveConflicts,
} from "../workflow-state/index.ts";
import { checkpointSession, emitProgress, replaceFindings, verifyReviewers } from "./helper-functions.ts";

type WorkflowReviewer = {
  reviewer_id: string;
  tool: string;
  adapter: ReturnType<typeof createAdapter>;
  role: string;
};

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
  onApproveImplementationReady,
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
  onApproveImplementationReady?: ((args: { findings: any[] }) => Promise<Map<string, boolean>>) | null;
  onResolveConflicts?: ((args: { session: any; conflicts: any[] }) => Promise<void>) | null;
  onProgress?: (event: unknown) => void;
  onCheckpoint?: (args: { session: any }) => Promise<void>;
}) {
  const reviewers = buildReviewers(config);
  await verifyReviewers({ reviewers, onProgress });

  const initial = await collectReviewerFindings({
    cwd,
    reviewers,
    diffText,
    docsText,
    auditRuns,
    commitMessages,
    existingFindings: session.findings,
    scanIteration,
    onProgress,
  });
  const findingsAfterPeerReview = await runPeerReview({
    cwd,
    reviewers,
    findings: initial.findings,
    diffText,
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

  session.audit_findings.push(
    ...buildTrackedAuditFindings({
      auditFindings: auditRuns.flatMap((run) => run.findings ?? []),
      findings: findingsWithOutcomes,
      auditAssessments: initial.auditAssessments,
    }),
  );
  session.findings.push(...findingsWithOutcomes);
  session.review_target.changed_files = await listReviewScopeFiles({
    cwd,
    diffBase: session.review_target.diff_base,
    includeWorktree,
  });
  await checkpointSession({ onCheckpoint, session });

  const consensusDecisions = typeof onApproveImplementationReady === "function"
    ? await onApproveImplementationReady({ findings: findingsWithOutcomes })
    : new Map<string, boolean>();
  let finalizedIterationFindings = applyConsensusApprovalDecisions({
    findings: findingsWithOutcomes,
    approvalByFindingId: consensusDecisions,
    autoUpdate: config.autoUpdate,
  });
  session.findings = replaceFindings({
    existingFindings: session.findings,
    nextFindings: finalizedIterationFindings,
  });
  await checkpointSession({ onCheckpoint, session });

  const conflicts = createConflicts({
    findings: finalizedIterationFindings,
    startIndex: session.conflicts.length,
  });
  session.conflicts.push(...conflicts);
  if (conflicts.length > 0) {
    session.cursor = { phase: CURSOR_PHASES.HITL_RESOLUTION, next_conflict_index: getNextPendingConflictIndex(session.conflicts) };
    session.status = SESSION_STATUSES.PAUSED;
    await checkpointSession({ onCheckpoint, session });

    if (typeof onResolveConflicts !== "function") {
      emitProgress({
        onProgress,
        message: `Review paused with ${conflicts.length} conflict(s) awaiting user resolution`,
      });
      return session;
    }

    await onResolveConflicts({ session, conflicts });
    finalizedIterationFindings = applyConflictResolutionDecisions({
      findings: finalizedIterationFindings,
      conflicts,
    });
    session.findings = replaceFindings({
      existingFindings: session.findings,
      nextFindings: finalizedIterationFindings,
    });
    session.conflicts = resolveConflicts(session.conflicts);
    session.cursor = null;
    session.status = SESSION_STATUSES.RUNNING;
    await checkpointSession({ onCheckpoint, session });
  }

  return finalizeReviewIteration({
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
  });
}

function buildReviewers(config): WorkflowReviewer[] {
  const directorTool = config.agents.director.tool;
  const reviewers: WorkflowReviewer[] = [
    {
      reviewer_id: REVIEWER_IDS.PRIMARY,
      tool: directorTool,
      adapter: createAdapter(directorTool),
      role: REVIEWER_ROLES.DIRECTOR,
    },
  ];
  const secondaryTool = config.agents.reviewers?.[0]?.tool;
  if (secondaryTool) {
    reviewers.push({
      reviewer_id: REVIEWER_IDS.SECONDARY,
      tool: secondaryTool,
      adapter: createAdapter(secondaryTool),
      role: REVIEWER_ROLES.REVIEWER,
    });
  }
  return reviewers;
}
