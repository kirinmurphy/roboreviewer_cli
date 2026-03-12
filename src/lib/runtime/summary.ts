import { AUDIT_FINDING_STATUSES, CONFLICT_STATUSES, RESOLUTION_STATUSES } from "../constants.ts";
import { INTERNAL_CONFIG } from "../internal-config.ts";

export function buildSummary(session) {
  const findingsById = new Map(session.findings.map((finding) => [finding.finding_id, finding]));
  const unresolved = session.conflicts.filter((conflict) => conflict.status !== CONFLICT_STATUSES.RESOLVED);
  const resolvedConflicts = session.conflicts.filter((conflict) => conflict.status === CONFLICT_STATUSES.RESOLVED);
  const consensusFindings = session.findings.filter((finding) => finding.resolution_status === RESOLUTION_STATUSES.IMPLEMENTED);
  const discardedFindings = session.findings.filter((finding) => finding.resolution_status === RESOLUTION_STATUSES.DISCARDED);
  const unresolvedAuditFindings = (session.audit_findings ?? []).filter(
    (finding) => finding.status === AUDIT_FINDING_STATUSES.NOT_ADOPTED,
  );

  const lines = ["# Debate Summary", ""];

  renderSection({
    lines,
    title: INTERNAL_CONFIG.summary.unresolvedConflictsTitle,
    items: unresolved,
    renderItem: (conflict, index) =>
      formatConflict({
        conflict,
        findingsById,
        index: index + 1,
      }),
  });
  renderSection({
    lines,
    title: INTERNAL_CONFIG.summary.resolvedDisputesTitle,
    items: resolvedConflicts,
    renderItem: (conflict, index) =>
      formatConflict({
        conflict,
        findingsById,
        index: index + 1,
      }),
  });
  renderSection({
    lines,
    title: INTERNAL_CONFIG.summary.consensusFixesTitle,
    items: consensusFindings,
    renderItem: ({ item, index }) => formatConsensusItem({ finding: item, index }),
  });
  renderSection({
    lines,
    title: INTERNAL_CONFIG.summary.discardedFindingsTitle,
    items: discardedFindings,
    renderItem: ({ item, index }) => formatConsensusItem({ finding: item, index }),
  });
  renderSection({
    lines,
    title: INTERNAL_CONFIG.summary.auditFindingsNotAdoptedTitle,
    items: unresolvedAuditFindings,
    renderItem: ({ item, index }) => formatAuditItem({ auditFinding: item, index }),
  });

  lines.push(INTERNAL_CONFIG.summary.reviewLogTitle, "");
  lines.push(`- Audit runs: ${session.audit_runs.length}`);
  lines.push(`- Audit findings tracked: ${(session.audit_findings ?? []).length}`);
  lines.push(`- Findings tracked: ${session.findings.length}`);
  lines.push(`- Conflicts queued: ${session.conflicts.length}`);
  lines.push(`- Implementation runs: ${session.implementation_runs.length}`);
  lines.push("");

  lines.push(INTERNAL_CONFIG.summary.sessionStatsTitle, "");
  lines.push(`- Status: ${session.status}`);
  if (session.failure?.message) {
    lines.push(`- Failure: ${formatFailureMessage({ message: session.failure.message })}`);
  }
  lines.push(`- Review target commits: ${session.review_target.resolved_commit_count}`);
  lines.push(`- Changed files: ${session.review_target.changed_files.length}`);
  lines.push(`- Redaction events: ${session.context.redaction_event_count}`);
  lines.push("");

  return `${lines.join("\n").trim()}\n`;
}

export function buildInProgressSummary(session) {
  const lines = [
    "# Debate Summary",
    "",
    "## Review Status",
    "",
    `- Status: ${session.status}`,
    "- Phase: review in progress",
    `- Session ID: ${session.session_id}`,
    `- Target commits: ${session.review_target.resolved_commit_count}`,
    "",
    "## Runtime Notes",
    "",
    "- Findings are still being collected.",
    "- This file will be replaced with the final summary when the run completes.",
    "",
  ];

  return `${lines.join("\n").trim()}\n`;
}

function renderSection({ lines, title, items, renderItem }) {
  lines.push(title, "");
  if (items.length === 0) {
    lines.push("None.", "");
    return;
  }
  items.forEach((item, index) => {
    lines.push(renderItem({ item, index: index + 1 }));
  });
  lines.push("");
}

function formatConflict({ conflict, findingsById, index }) {
  const finding = findingsById.get(conflict.finding_id);
  const location = finding?.location ? `${finding.location.file}:${finding.location.line}` : "unknown";
  const peerNote = finding?.peer_reviews?.[0]?.note ?? "No peer note recorded.";
  const sourceNote = finding?.pushback_resolution?.note ?? "No source response recorded.";
  const statusLabel = conflict.status === CONFLICT_STATUSES.RESOLVED ? "Resolved" : "Awaiting human decision";

  return [
    `${index}. **${location}** - ${finding?.summary ?? conflict.finding_id}`,
    `   - Source reviewer: ${finding?.source_reviewer_id ?? "unknown"}`,
    `   - Peer review: ${peerNote}`,
    `   - Pushback response: ${sourceNote}`,
    `   - Status: **${statusLabel}**`,
  ].join("\n");
}

function formatConsensusItem({ finding, index }) {
  const location = finding?.location ? `${finding.location.file}:${finding.location.line}` : "unknown";
  const attribution = Array.isArray(finding?.attribution) ? finding.attribution.join(", ") : finding?.source_reviewer_id;
  const disposition = [finding.roboreview_outcome, finding.decided_by, finding.resolution_status].filter(Boolean).join(", ");
  return `${index}. **${location}** - ${finding.summary} (${attribution}${disposition ? `; ${disposition}` : ""})`;
}

function formatAuditItem({ auditFinding, index }) {
  const tool = auditFinding.tool_id ?? "audit-tool";
  const adopted = auditFinding.adopted_by?.length ? `Adopted by ${auditFinding.adopted_by.join(", ")}` : "Not adopted by reviewers";
  const reason = auditFinding.not_adopted_reason ? ` Reason: ${auditFinding.not_adopted_reason}` : "";
  return `${index}. **${tool}** - ${auditFinding.summary} (${adopted})${reason}`;
}

function formatFailureMessage({ message }: { message: string }) {
  return message
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}
