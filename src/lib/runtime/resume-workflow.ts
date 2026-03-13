import { CURSOR_PHASES, SESSION_STATUSES } from "../constants.ts";
import { loadDocumentationContext } from "../docs.ts";
import { type Prompter, withPrompter } from "../system/interactive.ts";
import { saveSession } from "./session.ts";
import { collectConsensusApprovalDecisions } from "./manual-consensus.ts";
import { collectConflictDecisions } from "./resolve-workflow.ts";
import { finalizeReviewIteration } from "./finalizeReviewIteration.ts";
import { buildReviewers } from "./workflow/index.ts";
import { replaceFindings } from "./workflow/helper-functions.ts";
import {
  applyConflictResolutionDecisions,
  createConflictResolutionCursor,
  createConflicts,
  createFinalImplementationCursor,
  createReviewCursorMetadata,
  getCursorConflicts,
  getIterationFindings,
  getNextPendingConflictIndex,
  getReviewCursorMetadata,
  resolveConflicts,
} from "./workflow-state/index.ts";

export async function runResumeWorkflow({
  cwd,
  config,
  session,
  prompt,
}: {
  cwd: string;
  config: any;
  session: any;
  prompt?: Prompter;
}) {
  const reviewCursor = getReviewCursorMetadata(session.cursor);
  if (!session.cursor || !reviewCursor) {
    throw new Error("No resumable review workflow found.");
  }
  const reviewCursorState = createReviewCursorMetadata({
    scanIteration: reviewCursor.scanIteration,
    includeWorktree: reviewCursor.includeWorktree,
    reviewerFindingsCount: reviewCursor.reviewerFindingsCount,
    auditRunCount: reviewCursor.auditRunCount,
    docsPath: reviewCursor.docsPath,
  });

  const execute = async (activePrompt: Prompter) => {
    let finalizedIterationFindings = getIterationFindings({
      session,
      scanIteration: reviewCursor.scanIteration,
    });

    if (session.cursor.phase === CURSOR_PHASES.MANUAL_CONSENSUS_APPROVAL) {
      await collectConsensusApprovalDecisions({ cwd, session, prompt: activePrompt });
      finalizedIterationFindings = getIterationFindings({
        session,
        scanIteration: reviewCursor.scanIteration,
      });
      session.status = SESSION_STATUSES.RUNNING;
      await persistSession({ cwd, session });

      const conflicts = createConflicts({
        findings: finalizedIterationFindings,
        startIndex: session.conflicts.length,
      });
      session.conflicts.push(...conflicts);
      session.cursor = createConflictResolutionCursor({
        reviewCursor: reviewCursorState,
        conflictIds: conflicts.map((conflict) => conflict.conflict_id),
        nextConflictIndex: getNextPendingConflictIndex(session.conflicts),
      });
      session.status = conflicts.length > 0 ? SESSION_STATUSES.PAUSED : SESSION_STATUSES.RUNNING;
      if (conflicts.length === 0) {
        session.cursor = createFinalImplementationCursor({
          reviewCursor: reviewCursorState,
          conflictIds: [],
          nextConflictIndex: session.conflicts.length,
        });
      }
      await persistSession({ cwd, session });
    }

    if (session.cursor.phase === CURSOR_PHASES.HITL_RESOLUTION) {
      await collectConflictDecisions({ cwd, session, prompt: activePrompt });
      const currentConflicts = getCursorConflicts({ session });
      finalizedIterationFindings = applyConflictResolutionDecisions({
        findings: finalizedIterationFindings,
        conflicts: currentConflicts,
      });
      session.findings = replaceFindings({
        existingFindings: session.findings,
        nextFindings: finalizedIterationFindings,
      });
      session.conflicts = resolveConflicts(session.conflicts);
      session.cursor = createFinalImplementationCursor({
        reviewCursor: reviewCursorState,
        conflictIds: currentConflicts.map((conflict) => conflict.conflict_id),
        nextConflictIndex: session.conflicts.length,
      });
      session.status = SESSION_STATUSES.RUNNING;
      await persistSession({ cwd, session });
    }

    const reviewers = buildReviewers(config);
    const updatedSession = await finalizeReviewIteration({
      cwd,
      session,
      reviewers,
      finalizedIterationFindings,
      scanIteration: reviewCursor.scanIteration,
      includeWorktree: reviewCursor.includeWorktree,
      auditRunCount: reviewCursor.auditRunCount,
      reviewerFindingsCount: reviewCursor.reviewerFindingsCount,
      onProgress: undefined,
      onCheckpoint: async ({ session: nextSession }) => {
        await persistSession({ cwd, session: nextSession });
      },
    });

    await persistSession({ cwd, session: updatedSession });
    return updatedSession;
  };

  if (prompt) {
    return execute(prompt);
  }

  return withPrompter(execute);
}

async function loadDocsText({
  cwd,
  docsPath,
  maxDocsBytes,
}: {
  cwd: string;
  docsPath: string | null;
  maxDocsBytes: number;
}) {
  if (!docsPath) {
    return "";
  }

  const docsContext = await loadDocumentationContext({
    cwd,
    docsPath,
    maxDocsBytes,
  });
  return docsContext.docsText;
}

async function persistSession({ cwd, session }: { cwd: string; session: any }) {
  await saveSession({ cwd, session });
}
