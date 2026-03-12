import {
  DECIDED_BY,
  FINDING_STATUSES,
  POST_REVIEW_ACTION_LABELS,
  POST_REVIEW_ACTIONS,
  RESOLUTION_STATUSES,
} from "../../lib/constants.ts";
import { loadDocumentationContext } from "../../lib/docs.ts";
import { redactText } from "../../lib/redaction.ts";
import { runAuditTools } from "../../lib/runtime/audit.ts";
import { saveSession, saveSessionSummary } from "../../lib/runtime/session.ts";
import {
  buildInProgressSummary,
  buildSummary,
} from "../../lib/runtime/summary.ts";
import {
  buildUnifiedDiff,
  buildWorkspaceUnifiedDiff,
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
  const docsContext = await loadDocumentationContext({
    cwd,
    docsPath: docsOverride ?? config.context.docs_path,
    maxDocsBytes: config.context.max_docs_bytes,
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
  findings,
  prompt,
}) {
  const implementationReady = findings.filter(
    (finding) => finding.status === FINDING_STATUSES.IMPLEMENTATION_READY,
  );
  const approvalByFindingId = new Map<string, boolean>();
  if (implementationReady.length === 0) {
    return approvalByFindingId;
  }

  for (const finding of implementationReady) {
    process.stdout.write(
      `\n[Consensus] ${finding.summary}\n` +
        `Location: ${finding.location?.file ?? "unknown"}:${finding.location?.line ?? "?"}\n` +
        `Recommendation: ${finding.recommendation}\n`,
    );
    const approved = await prompt.confirm(
      "Approve this consensus update?",
      true,
    );
    approvalByFindingId.set(finding.finding_id, approved);
    applyApprovalPreview({ session, findingId: finding.finding_id, approved });
    await persistInProgressSession({ cwd, session });
  }

  return approvalByFindingId;
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
  await saveSessionSummary({
    cwd,
    session,
    summary: buildInProgressSummary(session),
  });
}

export async function persistFinalSession({ cwd, session }) {
  await saveSession({ cwd, session });
  await saveSessionSummary({ cwd, session, summary: buildSummary(session) });
}

function applyApprovalPreview({ session, findingId, approved }) {
  session.findings = session.findings.map((finding) => {
    if (finding.finding_id !== findingId) {
      return finding;
    }
    return {
      ...finding,
      user_approved: approved,
      decided_by: DECIDED_BY.USER,
      resolution_status: approved ? null : RESOLUTION_STATUSES.DISCARDED,
      status: approved ? finding.status : FINDING_STATUSES.RESOLVED,
    };
  });
}
