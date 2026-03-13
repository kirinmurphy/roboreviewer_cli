import { renderReviewCompletion } from "../../lib/output/review-output/index.ts";
import { collectConflictDecisions } from "../../lib/runtime/resolve-workflow.ts";
import { runReviewWorkflow } from "../../lib/runtime/workflow/index.ts";
import { type Prompter } from "../../lib/system/interactive.ts";
import {
  loadIterationContext,
  persistFinalSession,
  persistInProgressSession,
  promptForConsensusApprovals,
} from "./helper-functions.ts";
import { collectAuditFixApprovals } from "../../lib/runtime/approveAuditFixes.ts";

export async function runIteration({
  cwd,
  config,
  session,
  reviewTarget,
  docsOverride,
  writeEvent,
  context,
  includeWorktree,
  prompt,
}: {
  cwd: string;
  config: any;
  session: any;
  reviewTarget: any;
  docsOverride: string | null;
  writeEvent: (event: unknown) => void;
  context?: any;
  includeWorktree: boolean;
  prompt: Prompter;
}) {
  const iterationContext =
    context ??
    (await loadIterationContext({
      cwd,
      config,
      docsOverride,
      reviewTarget,
      includeWorktree,
      includeAuditTools: !includeWorktree,
      writeEvent,
    }));

  const updatedSession = await runReviewWorkflow({
    cwd,
    config,
    session,
    diffText: iterationContext.redactedDiff.text,
    docsText: iterationContext.docsContext.docsText,
    auditRuns: iterationContext.auditRuns,
    commitMessages: reviewTarget.commitMessages,
    scanIteration: session.iterations.length + 1,
    includeWorktree,
    docsPath: docsOverride ?? config.context.docs_path,
    diffBase: reviewTarget.diffBase,
    onApproveImplementationReady:
      config.autoUpdate === false
        ? async () =>
            promptForConsensusApprovals({
              cwd,
              session,
              prompt,
            })
        : null,
    onApproveAuditFixes:
      config.autoUpdate === false
        ? async ({ findings }) =>
            collectAuditFixApprovals({
              findings,
              prompt,
            })
        : undefined,
    onResolveConflicts: async ({ session: nextSession }) => {
      await collectConflictDecisions({
        cwd,
        session: nextSession,
        prompt,
      });
    },
    onProgress: writeEvent,
    onCheckpoint: async ({ session: nextSession }) => {
      await persistInProgressSession({ cwd, session: nextSession });
    },
  });

  await persistFinalSession({ cwd, session: updatedSession });
  process.stdout.write(renderReviewCompletion({ session: updatedSession }));
  return updatedSession;
}
