import {
  POST_REVIEW_ACTIONS,
  SESSION_STATUSES,
} from "../../lib/constants.ts";
import { loadConfig } from "../../lib/config.ts";
import { createSessionId } from "../../lib/ids.ts";
import { renderReviewCompletion } from "../../lib/output/review-output/index.ts";
import { collectConflictDecisions } from "../../lib/runtime/resolve-workflow.ts";
import { clearRuntimeTmp, createSession, ensureRuntime, getRuntimePaths } from "../../lib/runtime/session.ts";
import { runReviewWorkflow } from "../../lib/runtime/workflow/index.ts";
import { ensureAttachedHead, ensureCleanWorkingTree, ensureGitRepository, resolveReviewTarget } from "../../lib/system/git.ts";
import { type Prompter, withPrompter } from "../../lib/system/interactive.ts";
import { createReviewWriter } from "./createReviewWriter.ts";
import {
  choosePostReviewAction,
  loadIterationContext,
  persistFinalSession,
  persistInProgressSession,
  promptForConsensusApprovals,
} from "./helper-functions.ts";

export async function runReviewCommand(options) {
  const cwd = process.cwd();
  const writeEvent = createReviewWriter({ verbose: options.verbose });
  let session = null;

  try {
    writeEvent("Preparing runtime");
    await ensureRuntime(cwd);
    await clearRuntimeTmp({ cwd });
    const runtimePaths = getRuntimePaths({ cwd });
    writeEvent(`Runtime directory: ${runtimePaths.runtimeDir}`);

    writeEvent("Checking git repository state");
    await ensureGitRepository(cwd);
    await ensureAttachedHead(cwd);
    await ensureCleanWorkingTree(cwd);

    writeEvent("Loading Roboreviewer config");
    const config = await loadConfig(cwd);
    writeEvent("Resolving review target");
    const reviewTarget = await resolveReviewTarget({
      cwd,
      selector: options.selector,
      useLast: options.last,
    });

    const initialContext = await loadIterationContext({
      cwd,
      config,
      docsOverride: options.docsOverride,
      reviewTarget,
      includeWorktree: false,
      includeAuditTools: true,
      writeEvent,
    });

    writeEvent("Creating review session");
    session = createSession({
      sessionId: createSessionId(),
      reviewTarget,
      docsFiles: initialContext.docsContext.files,
      docsBytes: initialContext.docsContext.totalBytes,
      redactionCount: initialContext.redactedDiff.count,
      auditRuns: initialContext.auditRuns,
    });
    await persistInProgressSession({ cwd, session });

    session = await withPrompter(async (prompt) => {
      const afterFirstIteration = await runIteration({
        cwd,
        config,
        session,
        reviewTarget,
        docsOverride: options.docsOverride,
        writeEvent,
        context: initialContext,
        includeWorktree: false,
        prompt,
      });
      return runPostReviewLoop({
        cwd,
        config,
        session: afterFirstIteration,
        reviewTarget,
        docsOverride: options.docsOverride,
        writeEvent,
        prompt,
      });
    });

    process.stdout.write("\n");
    writeEvent("Writing session files");
    await persistFinalSession({ cwd, session });
    await clearRuntimeTmp({ cwd });
  } catch (error) {
    if (session) {
      session.status = SESSION_STATUSES.FAILED;
      session.failure = {
        message: error instanceof Error ? error.message : String(error),
      };
    }
    await attemptCleanup({ cwd, session });
    throw error;
  }
}

async function runIteration({
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
    onApproveImplementationReady:
      config.autoUpdate === false
        ? async ({ findings }) =>
            promptForConsensusApprovals({
              cwd,
              session,
              findings,
              prompt,
            })
        : null,
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

async function runPostReviewLoop({ cwd, config, session, reviewTarget, docsOverride, writeEvent, prompt }) {
  while (true) {
    const action = await choosePostReviewAction({ prompt });
    if (action === POST_REVIEW_ACTIONS.END_SCAN) {
      return session;
    }

    if (action === POST_REVIEW_ACTIONS.REPEAT_SCAN) {
      session = await runIteration({
        cwd,
        config,
        session,
        reviewTarget,
        docsOverride,
        writeEvent,
        includeWorktree: true,
        prompt,
      });
    }
  }
}

async function attemptCleanup({ cwd, session }: { cwd: string; session: any }) {
  try {
    if (session) {
      await persistFinalSession({ cwd, session });
    }
  } catch (cleanupError) {
    logCleanupFailure({
      step: "persist final session",
      error: cleanupError,
    });
  }

  try {
    await clearRuntimeTmp({ cwd });
  } catch (cleanupError) {
    logCleanupFailure({
      step: "clear runtime tmp files",
      error: cleanupError,
    });
  }
}

function logCleanupFailure({ step, error }: { step: string; error: unknown }) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Secondary cleanup failure while attempting to ${step}: ${detail}`);
}
