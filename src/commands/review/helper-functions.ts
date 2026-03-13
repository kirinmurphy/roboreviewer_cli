import {
  POST_REVIEW_ACTION_LABELS,
  POST_REVIEW_ACTIONS,
} from "../../lib/constants.ts";
import { loadFilteredDocumentationContext } from "../../lib/docs.ts";
import { redactText } from "../../lib/redaction.ts";
import { runAuditTools } from "../../lib/runtime/audit.ts";
import { collectConsensusApprovalDecisions } from "../../lib/runtime/manual-consensus.ts";
import { saveSession } from "../../lib/runtime/session.ts";
import {
  buildUnifiedDiff,
  buildWorkspaceUnifiedDiff,
  listReviewScopeFiles,
} from "../../lib/system/git.ts";
import { type Prompter } from "../../lib/system/interactive.ts";

export async function loadIterationContext({
  cwd,
  config,
  docsOverride,
  reviewTarget,
  includeWorktree,
  includeAuditTools,
  writeEvent,
}) {
  writeEvent(
    includeWorktree
      ? "Building repeat-scan diff from the original review base plus current workspace changes"
      : `Building diff for ${reviewTarget.commitShas.length} commit(s)`,
  );
  const diff = includeWorktree
    ? await buildWorkspaceUnifiedDiff({ cwd, diffBase: reviewTarget.diffBase })
    : await buildUnifiedDiff({ cwd, reviewTarget });
  const redactedDiff = redactText(diff);

  writeEvent("Loading documentation context");
  // Get changed files for smart documentation filtering
  const changedFiles = await listReviewScopeFiles({
    cwd,
    diffBase: reviewTarget.diffBase,
    includeWorktree,
  });
  const docsContext = await loadFilteredDocumentationContext({
    cwd,
    docsPath: docsOverride ?? config.context.docs_path,
    maxDocsBytes: config.context.max_docs_bytes,
    changedFiles,
    diffText: redactedDiff.text,
  });

  let auditRuns = [];
  if (includeAuditTools) {
    writeEvent("Running audit tools");
    auditRuns = await runAuditTools({
      cwd,
      auditTools: config.audit_tools ?? [],
      reviewTarget,
      onProgress: writeEvent,
    });
  } else {
    writeEvent("Skipping audit tools for repeat scan");
  }

  return {
    redactedDiff,
    docsContext,
    auditRuns,
  };
}

export async function promptForConsensusApprovals({
  cwd,
  session,
  prompt,
}) {
  return collectConsensusApprovalDecisions({ cwd, session, prompt });
}

export async function choosePostReviewAction({ prompt }: { prompt: Prompter }) {
  const selected = await prompt.choose(
    "\n\nWould you like to",
    [POST_REVIEW_ACTION_LABELS.REPEAT_SCAN, POST_REVIEW_ACTION_LABELS.END_SCAN],
    0,
  );
  return selected === POST_REVIEW_ACTION_LABELS.REPEAT_SCAN
    ? POST_REVIEW_ACTIONS.REPEAT_SCAN
    : POST_REVIEW_ACTIONS.END_SCAN;
}

export async function persistInProgressSession({ cwd, session }) {
  await saveSession({ cwd, session });
}

export async function persistFinalSession({ cwd, session }) {
  await saveSession({ cwd, session });
}
