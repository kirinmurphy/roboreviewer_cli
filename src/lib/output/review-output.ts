import { SESSION_PATH } from "../constants.ts";
import { INTERNAL_CONFIG } from "../internal-config.ts";

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  red: "\u001B[31m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  blue: "\u001B[34m",
  magenta: "\u001B[35m",
  cyan: "\u001B[36m",
  gray: "\u001B[90m",
} as const;

export function renderReviewEvent({ event, verbose = false }: { event: any; verbose?: boolean }) {
  if (typeof event === "string") {
    return `${formatStageLine({ message: event })}\n`;
  }

  if (event.type === "audit_results") {
    return renderAuditResults({ auditRuns: event.auditRuns });
  }

  if (event.type === "audit_status") {
    return renderAuditStatus({
      toolId: event.toolId,
      phase: event.phase,
      result: event.result,
    });
  }

  if (event.type === "reviewer_findings") {
    return renderReviewerFindings({
      reviewer: event.reviewer,
      findings: event.findings,
      verbose,
    });
  }

  if (event.type === "peer_review") {
    return renderPeerReview({
      reviewer: event.reviewer,
      comments: event.comments,
      findings: event.findings,
      verbose,
    });
  }

  if (event.type === "pushback_response") {
    return renderPushbackResponse({
      reviewer: event.reviewer,
      responses: event.responses,
      findings: event.findings,
      verbose,
    });
  }

  if (event.type === "consensus_summary") {
    return renderConsensusSummary({
      implementationReady: event.implementationReady,
      resolved: event.resolved,
      nonConsensus: event.nonConsensus,
    });
  }

  if (event.type === "implementation_result") {
    return renderImplementationResult({
      filesTouched: event.filesTouched,
    });
  }

  return "";
}

export function renderReviewCompletion({ session }: { session: any }) {
  return [
    "",
    renderNotAdoptedAuditFindings({ session }),
    renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.completionTitle, tone: "green" }),
    `${indent(1)}See ${SESSION_PATH} for full audit details.`,
    "",
    renderNonConsensusAfterCompletion({ session }),
  ].join("\n");
}

function renderAuditResults({ auditRuns }: { auditRuns: any[] }) {
  const lines = [renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.auditTitle, tone: "yellow" })];

  if (auditRuns.length === 0) {
    lines.push(`${indent(1)}No audit tools configured.`);
    lines.push("");
    return lines.join("\n");
  }

  for (const run of auditRuns) {
    lines.push(`${indent(1)}${formatToolLabel({ tool: run.id })} ${formatStatus({ status: run.status })}`);
    if (run.error) {
      lines.push(`${indent(2)}${formatLabel({ label: "Error" })} ${colorize({ text: run.error, tone: "red" })}`);
      lines.push("");
      continue;
    }
    lines.push(`${indent(2)}${formatLabel({ label: "Count" })} ${(run.findings ?? []).length}`);
    lines.push("");
    for (const [index, finding] of (run.findings ?? []).entries()) {
      lines.push(
        renderAuditFindingDetail({
          auditFinding: finding,
          auditFindingId: `f-${String(index + 1).padStart(3, "0")}-${run.id}`,
        }),
      );
    }
    lines.push(`${indent(2)}See ${SESSION_PATH} for the full ${run.id} output.`);
    lines.push("");
  }

  return lines.join("\n");
}

function renderAuditStatus({ toolId, phase, result }: { toolId: string; phase: string; result?: any }) {
  if (phase === "starting") {
    return [
      renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.auditTitle, tone: "yellow" }),
      `${indent(1)}${formatToolLabel({ tool: toolId })} ${formatBadge({ text: "running", tone: "yellow" })}`,
      "",
    ].join("\n");
  }

  if (!result) {
    return "";
  }

  return renderAuditResults({ auditRuns: [result] });
}

function renderReviewerFindings({ reviewer, findings, verbose }: { reviewer: any; findings: any[]; verbose: boolean }) {
  const lines = [
    renderSectionHeader({
      title: `${INTERNAL_CONFIG.cli.review.reviewerFindingsTitle}: ${reviewer.tool}`,
      tone: "cyan",
    }),
    `${indent(1)}${formatLabel({ label: "Count" })} ${findings.length}`,
    "",
  ];

  for (const finding of findings) {
    lines.push(
      verbose
        ? renderFindingBlock({ finding, includeRecommendation: true })
        : renderCompactFindingDetail({ finding }),
    );
  }

  return lines.join("\n");
}

function renderPeerReview({ reviewer, comments, findings, verbose }: { reviewer: any; comments: any[]; findings: any[]; verbose: boolean }) {
  const sourceReviewers = summarizeSourceReviewers({ comments, findings });
  const lines = [
    renderSectionHeader({
      title: `${INTERNAL_CONFIG.cli.review.peerReviewTitle}: ${reviewer.tool} reviewing ${sourceReviewers}`,
      tone: "blue",
    }),
  ];

  if (!verbose) {
    const pushbacks = comments.filter((comment) => comment.stance === "pushback");
    const agrees = comments.length - pushbacks.length;
    lines.push(`${indent(1)}${formatLabel({ label: "Agree" })} ${agrees}`);
    lines.push(`${indent(1)}${formatLabel({ label: "Pushback" })} ${pushbacks.length}`);
    lines.push("");
    for (const comment of pushbacks) {
      const finding = findings.find((item) => item.finding_id === comment.finding_id);
      lines.push(`${indent(1)}${colorize({ text: comment.finding_id, tone: "yellow", bold: true })} ${finding?.summary ?? comment.finding_id}`);
      lines.push(formatMultilineBlock({ text: summarizeText({ text: comment.note, limit: 220 }), indentLevel: 2 }));
      lines.push("");
    }
    return lines.join("\n");
  }

  for (const comment of comments) {
    const finding = findings.find((item) => item.finding_id === comment.finding_id);
    const tone = comment.stance === "agree" ? "green" : "yellow";
    lines.push(
      `${indent(1)}${colorize({ text: comment.finding_id, tone, bold: true })} ${formatBadge({ text: comment.stance, tone })}`,
    );
    lines.push(formatMultilineBlock({ text: finding?.summary ?? comment.finding_id, indentLevel: 2 }));
    lines.push(`${indent(2)}${formatLabel({ label: "Note" })}`);
    lines.push(formatMultilineBlock({ text: comment.note, indentLevel: 3 }));
    lines.push("");
  }

  return lines.join("\n");
}

function renderPushbackResponse({ reviewer, responses, findings, verbose }: { reviewer: any; responses: any[]; findings: any[]; verbose: boolean }) {
  const lines = [
    renderSectionHeader({
      title: `${INTERNAL_CONFIG.cli.review.pushbackTitle} from ${reviewer.tool}`,
      tone: "magenta",
    }),
  ];

  if (!verbose) {
    const withdrawn = responses.filter((response) => response.withdrawn);
    const kept = responses.length - withdrawn.length;
    lines.push(`${indent(1)}${formatLabel({ label: "Withdrawn" })} ${withdrawn.length}`);
    lines.push(`${indent(1)}${formatLabel({ label: "Kept" })} ${kept}`);
    lines.push("");
    for (const response of responses.filter((item) => !item.withdrawn)) {
      const finding = findings.find((item) => item.finding_id === response.finding_id);
      lines.push(`${indent(1)}${colorize({ text: response.finding_id, tone: "green", bold: true })} ${finding?.summary ?? response.finding_id}`);
      lines.push(formatMultilineBlock({ text: summarizeText({ text: response.note, limit: 220 }), indentLevel: 2 }));
      lines.push("");
    }
    return lines.join("\n");
  }

  for (const response of responses) {
    const finding = findings.find((item) => item.finding_id === response.finding_id);
    const tone = response.withdrawn ? "yellow" : "green";
    const disposition = response.withdrawn ? "withdrawn" : "kept";
    lines.push(
      `${indent(1)}${colorize({ text: response.finding_id, tone, bold: true })} ${formatBadge({ text: disposition, tone })}`,
    );
    lines.push(formatMultilineBlock({ text: finding?.summary ?? response.finding_id, indentLevel: 2 }));
    lines.push(`${indent(2)}${formatLabel({ label: "Note" })}`);
    lines.push(formatMultilineBlock({ text: response.note, indentLevel: 3 }));
    lines.push("");
  }

  return lines.join("\n");
}

function renderConsensusSummary({
  implementationReady,
  resolved,
}: {
  implementationReady: any[];
  resolved: any[];
  nonConsensus: any[];
}) {
  const lines = [renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.consensusTitle, tone: "green" })];

  lines.push(`${indent(1)}${formatLabel({ label: "Implementation Ready" })} ${implementationReady.length}`);
  for (const finding of implementationReady) {
    lines.push(renderCompactFindingDetail({ finding, tone: "green", includeRecommendation: true }));
  }
  lines.push("");

  lines.push(`${indent(1)}${formatLabel({ label: "Withdrawn / Resolved" })} ${resolved.length}`);
  for (const finding of resolved) {
    lines.push(renderCompactFindingDetail({ finding, tone: "yellow" }));
  }
  lines.push("");

  return lines.join("\n");
}

function renderImplementationResult({ filesTouched }: { filesTouched: string[] }) {
  const lines = [renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.implementationTitle, tone: "green" })];

  lines.push(`${indent(1)}${formatLabel({ label: "Files Touched" })}`);
  if (filesTouched.length === 0) {
    lines.push(`${indent(2)}none`);
  } else {
    for (const filePath of filesTouched) {
      lines.push(`${indent(2)}${filePath}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

function renderNotAdoptedAuditFindings({ session }: { session: any }) {
  const notAdopted = (session.audit_findings ?? []).filter((finding) => finding.status === "not_adopted");
  if (notAdopted.length === 0) {
    return "";
  }

  const lines = [renderSectionHeader({ title: "CodeRabbit Findings Not Adopted", tone: "yellow" })];
  for (const finding of notAdopted) {
    lines.push(`${indent(1)}${colorize({ text: finding.audit_finding_id, tone: "yellow", bold: true })}`);
    lines.push(`${indent(2)}${finding.summary}`);
    if (finding.not_adopted_reason) {
      lines.push(`${indent(2)}${formatLabel({ label: "Reason" })} ${finding.not_adopted_reason}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderNonConsensusAfterCompletion({ session }: { session: any }) {
  const nonConsensus = (session.findings ?? []).filter((finding) => finding.status === "non_consensus");
  if (nonConsensus.length === 0) {
    return "";
  }

  const lines = [renderSectionHeader({ title: "Remaining Non-Consensus", tone: "red" })];
  lines.push(`${indent(1)}${formatLabel({ label: "Count" })} ${nonConsensus.length}`);
  lines.push("");
  for (const finding of nonConsensus) {
    lines.push(renderCompactFindingDetail({ finding, tone: "red", includeRecommendation: true }));
  }
  lines.push(`${indent(1)}Use command \`roboreviewer resolve\` to decide how to resolve the above non-consensus item(s).`);
  lines.push("");
  return lines.join("\n");
}

function renderAuditFindingDetail({
  auditFinding,
  auditFindingId,
}: {
  auditFinding: any;
  auditFindingId: string;
}) {
  const lines = [
    `${indent(1)}${colorize({ text: auditFindingId, tone: "yellow", bold: true })}`,
  ];

  if (auditFinding.file || extractAuditFilePath({ rawText: auditFinding.raw_text })) {
  lines.push(
      `${indent(2)}${colorize({ text: auditFinding.file || extractAuditFilePath({ rawText: auditFinding.raw_text })!, tone: "gray" })}`,
    );
  }

  lines.push(
    formatMultilineBlock({
      text: summarizeText({
        text: normalizeAuditDescription({ auditFinding }),
        limit: 420,
      }),
      indentLevel: 2,
    }),
  );
  lines.push("");
  return lines.join("\n");
}

function extractAuditFilePath({ rawText }: { rawText: string }) {
  const fileMatch = rawText.match(/In @([^\s]+)|(?:^|\n)File:\s+(.+)$/m);
  return fileMatch?.[1] ?? fileMatch?.[2] ?? "";
}

function normalizeAuditDescription({ auditFinding }: { auditFinding: any }) {
  return (auditFinding.raw_text || auditFinding.summary || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function summarizeSourceReviewers({ comments, findings }: { comments: any[]; findings: any[] }) {
  const reviewerTools = comments
    .map((comment) => findings.find((finding) => finding.finding_id === comment.finding_id)?.source_reviewer_tool)
    .filter(Boolean);
  const uniqueTools = [...new Set(reviewerTools)];
  if (uniqueTools.length === 0) {
    return "unknown reviewer";
  }
  return uniqueTools.join(", ");
}

function formatFindingDisplayId({ finding }: { finding: any }) {
  const suffix = finding.source_reviewer_tool ?? finding.source_reviewer_id;
  if (!suffix || String(finding.finding_id).endsWith(`-${suffix}`)) {
    return finding.finding_id;
  }
  return `${finding.finding_id}-${suffix}`;
}

function renderFindingBlock({ finding, includeRecommendation }: { finding: any; includeRecommendation: boolean }) {
  const reviewerLabel = finding.source_reviewer_tool ?? finding.source_reviewer_id ?? "unknown";
  const lines = [
    `${indent(1)}${colorize({ text: formatFindingDisplayId({ finding }), tone: severityTone({ severity: finding.severity }), bold: true })} ${formatSeverityBadge({ finding })}`,
    `${indent(2)}${formatLocation({ finding })}`,
    `${indent(2)}${formatLabel({ label: "Source" })} ${reviewerLabel}`,
    formatMultilineBlock({ text: finding.summary, indentLevel: 2 }),
  ];

  if (includeRecommendation) {
    lines.push(`${indent(2)}${formatLabel({ label: "Recommendation" })}`);
    lines.push(formatMultilineBlock({ text: finding.recommendation, indentLevel: 3 }));
  }

  lines.push("");
  return lines.join("\n");
}

function renderCompactFindingDetail({
  finding,
  tone,
  includeRecommendation = true,
}: {
  finding: any;
  tone?: Tone;
  includeRecommendation?: boolean;
}) {
  const reviewerLabel = finding.source_reviewer_tool ?? finding.source_reviewer_id ?? "unknown";
  const findingTone = tone ?? severityTone({ severity: finding.severity });
  const lines = [
    `${indent(1)}${colorize({ text: formatFindingDisplayId({ finding }), tone: findingTone, bold: true })} ${formatSeverityBadge({ finding })}`,
    `${indent(2)}${formatLocation({ finding })}`,
    `${indent(2)}${formatLabel({ label: "Source" })} ${reviewerLabel}`,
    formatMultilineBlock({ text: summarizeText({ text: finding.summary, limit: 320 }), indentLevel: 2 }),
  ];

  if (includeRecommendation && finding.recommendation) {
    lines.push(`${indent(2)}${formatLabel({ label: "Recommendation" })}`);
    lines.push(formatMultilineBlock({ text: summarizeText({ text: finding.recommendation, limit: 320 }), indentLevel: 3 }));
  }

  lines.push("");
  return lines.join("\n");
}

function renderSectionHeader({ title, tone }: { title: string; tone: Tone }) {
  const divider = "=".repeat(INTERNAL_CONFIG.cli.sectionDividerWidth);
  return [
    "",
    colorize({ text: divider, tone: "gray" }),
    colorize({ text: title, tone, bold: true }),
    colorize({ text: divider, tone: "gray" }),
    "",
  ].join("\n");
}

function formatStageLine({ message }: { message: string }) {
  return `${colorize({ text: "[roboreviewer]", tone: "gray", bold: true })} ${message}`;
}

function formatToolLabel({ tool }: { tool: string }) {
  return colorize({ text: tool, tone: "cyan", bold: true });
}

function formatStatus({ status }: { status: string }) {
  if (status === "ok") {
    return formatBadge({ text: status, tone: "green" });
  }
  if (status === "error") {
    return formatBadge({ text: status, tone: "red" });
  }
  return formatBadge({ text: status, tone: "yellow" });
}

function formatSeverityBadge({ finding }: { finding: any }) {
  const tone = severityTone({ severity: finding.severity });
  return `${formatBadge({ text: `${finding.severity}/${finding.category}`, tone })}`;
}

function formatBadge({ text, tone }: { text: string; tone: Tone }) {
  return colorize({ text: `[${text}]`, tone, bold: true });
}

function formatLabel({ label }: { label: string }) {
  return colorize({ text: `${label}:`, tone: "gray", bold: true });
}

function formatLocation({ finding }: { finding: any }) {
  const location = finding.location ? `${finding.location.file}:${finding.location.line}` : "unknown";
  return colorize({ text: location, tone: "gray" });
}

function severityTone({ severity }: { severity: string }): Tone {
  if (severity === "high") {
    return "red";
  }
  if (severity === "medium") {
    return "yellow";
  }
  return "blue";
}

function colorize({ text, tone, bold = false }: { text: string; tone: Tone; bold?: boolean }) {
  if (!process.stdout.isTTY) {
    return text;
  }

  const parts = [];
  if (bold) {
    parts.push(ANSI.bold);
  }
  parts.push(ANSI[tone]);
  parts.push(text);
  parts.push(ANSI.reset);
  return parts.join("");
}

function indent(level: number) {
  return "  ".repeat(level);
}

function formatMultilineBlock({ text, indentLevel }: { text: string; indentLevel: number }) {
  return text
    .split("\n")
    .map((line) => `${indent(indentLevel)}${line}`)
    .join("\n");
}

function summarizeText({ text, limit }: { text: string; limit: number }) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

type Tone = "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "gray";
