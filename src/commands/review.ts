import { loadConfig } from "../lib/config.ts";
import { loadDocumentationContext } from "../lib/docs.ts";
import { buildUnifiedDiff, ensureAttachedHead, ensureCleanWorkingTree, ensureGitRepository, resolveReviewTarget } from "../lib/system/git.ts";
import { redactText } from "../lib/redaction.ts";
import { buildInProgressSummary, buildSummary } from "../lib/runtime/summary.ts";
import { clearRuntimeTmp, createSession, ensureRuntime, getRuntimePaths, saveSession, saveSessionSummary } from "../lib/runtime/session.ts";
import { createSessionId } from "../lib/ids.ts";
import { runAuditTools } from "../lib/runtime/audit.ts";
import { renderReviewCompletion, renderReviewEvent } from "../lib/output/review-output.ts";
import { runReviewWorkflow } from "../lib/runtime/workflow.ts";
import { SESSION_STATUSES } from "../lib/constants.ts";

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
    writeEvent(`Building diff for ${reviewTarget.commitShas.length} commit(s)`);
    const diff = await buildUnifiedDiff({ cwd, reviewTarget });
    const redactedDiff = redactText(diff);
    writeEvent("Loading documentation context");
    const docsContext = await loadDocumentationContext({
      cwd,
      docsPath: options.docsOverride ?? config.context.docs_path,
      maxDocsBytes: config.context.max_docs_bytes,
    });
    writeEvent("Running audit tools");
    const auditRuns = await runAuditTools({
      cwd,
      auditTools: config.audit_tools ?? [],
      reviewTarget,
      onProgress: writeEvent,
    });
    writeEvent("Creating review session");
    session = createSession({
      sessionId: createSessionId(),
      reviewTarget,
      docsFiles: docsContext.files,
      docsBytes: docsContext.totalBytes,
      redactionCount: redactedDiff.count,
      auditRuns,
    });
    await saveSession({ cwd, session });
    await saveSessionSummary({ cwd, session, summary: buildInProgressSummary(session) });

    const updatedSession = await runReviewWorkflow({
      cwd,
      config,
      session,
      diffText: redactedDiff.text,
      docsText: docsContext.docsText,
      auditRuns,
      commitMessages: reviewTarget.commitMessages,
      onProgress: writeEvent,
      onCheckpoint: async ({ session: nextSession }) => {
        await saveSession({ cwd, session: nextSession });
        await saveSessionSummary({ cwd, session: nextSession, summary: buildInProgressSummary(nextSession) });
      },
    });

    writeEvent("Writing session files");
    await saveSession({ cwd, session: updatedSession });
    await saveSessionSummary({ cwd, session: updatedSession, summary: buildSummary(updatedSession) });
    await clearRuntimeTmp({ cwd });

    process.stdout.write(renderReviewCompletion({ session: updatedSession }));
  } catch (error) {
    if (session) {
      session.status = SESSION_STATUSES.FAILED;
      session.failure = {
        message: error instanceof Error ? error.message : String(error),
      };
      await saveSession({ cwd, session });
      await saveSessionSummary({ cwd, session, summary: buildSummary(session) });
    }
    await clearRuntimeTmp({ cwd });
    throw error;
  }
}

function createReviewWriter({ verbose }) {
  let transientAuditLineVisible = false;
  let lastRenderedBlock = false;

  return (event) => {
    if (isAuditStartEvent({ event })) {
      writeTransientAuditLine({ event });
      transientAuditLineVisible = true;
      return;
    }

    if (isAuditFinalEvent({ event })) {
      if (transientAuditLineVisible) {
        clearTransientAuditLine();
        transientAuditLineVisible = false;
      }
      process.stdout.write(renderReviewEvent({ event, verbose }));
      lastRenderedBlock = true;
      return;
    }

    if (transientAuditLineVisible) {
      clearTransientAuditLine();
      transientAuditLineVisible = false;
    }

    if (typeof event === "string" && lastRenderedBlock) {
      process.stdout.write("\n");
    }
    process.stdout.write(renderReviewEvent({ event, verbose }));
    lastRenderedBlock = typeof event !== "string";
  };
}

function clearTransientAuditLine() {
  if (!process.stdout.isTTY) {
    return;
  }

  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
}

function isAuditFinalEvent({ event }) {
  return typeof event !== "string" && event?.type === "audit_status" && event.phase !== "starting";
}

function isAuditStartEvent({ event }) {
  return typeof event !== "string" && event?.type === "audit_status" && event.phase === "starting";
}

function writeTransientAuditLine({ event }) {
  const text = `[roboreviewer] Audit: ${event.toolId} running...`;
  if (!process.stdout.isTTY) {
    process.stdout.write(`${text}\n`);
    return;
  }

  process.stdout.write(`\r${text}`);
}
