import { SESSION_STATUSES } from "../../lib/constants.ts";
import { loadConfig } from "../../lib/config.ts";
import { createSessionId } from "../../lib/ids.ts";
import { clearRuntimeTmp, createSession, ensureRuntime, getRuntimePaths } from "../../lib/runtime/session.ts";
import { ensureAttachedHead, ensureCleanWorkingTree, ensureGitRepository, resolveReviewTarget } from "../../lib/system/git.ts";
import { withPrompter } from "../../lib/system/interactive.ts";
import { attemptCleanup } from "./attemptCleanup.ts";
import { createReviewWriter } from "./createReviewWriter.ts";
import {
  loadIterationContext,
  persistFinalSession,
  persistInProgressSession,
} from "./helper-functions.ts";
import { runIteration } from "./runIteration.ts";
import { runPostReviewLoop } from "./runPostReviewLoop.ts";

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
