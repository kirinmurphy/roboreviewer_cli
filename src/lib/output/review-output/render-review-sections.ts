import { INTERNAL_CONFIG } from "../../internal-config.ts";
import { formatBadge, formatDisplayId, formatLabel, renderSectionHeader } from "./helper-functions.ts";
import { formatFindingDisplayId, renderCompactFindingDetail, renderFindingBlock, summarizeSourceReviewers } from "./format-finding.ts";

export function renderReviewerFindings({ reviewer, findings, verbose }: { reviewer: any; findings: any[]; verbose: boolean }) {
  const lines = [
    renderSectionHeader({
      title: `${INTERNAL_CONFIG.cli.review.reviewerFindingsTitle}: ${reviewer.tool}`,
      tone: "cyan",
    }),
    `${formatLabel({ label: "Count" })} ${findings.length}`,
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

export function renderPeerReview({ reviewer, comments, findings, verbose }: { reviewer: any; comments: any[]; findings: any[]; verbose: boolean }) {
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
    lines.push(`${formatLabel({ label: "Agree" })} ${agrees}`);
    lines.push(`${formatLabel({ label: "Pushback" })} ${pushbacks.length}`);
    lines.push("");
    for (const comment of pushbacks) {
      const finding = findings.find((item) => item.finding_id === comment.finding_id);
      const displayId = finding ? formatFindingDisplayId({ finding }) : formatDisplayId({ text: comment.finding_id });
      lines.push(`${displayId} ${finding?.summary ?? comment.finding_id}`);
      lines.push(`  ${comment.note}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  for (const comment of comments) {
    const finding = findings.find((item) => item.finding_id === comment.finding_id);
    const tone = comment.stance === "agree" ? "green" : "yellow";
    const displayId = finding ? formatFindingDisplayId({ finding }) : formatDisplayId({ text: comment.finding_id });
    lines.push(
      `${displayId} ${formatBadge({ text: comment.stance, tone })}`,
    );
    lines.push(`${finding?.summary ?? comment.finding_id}`);
    lines.push(`${formatLabel({ label: "Note" })}`);
    lines.push(`  ${comment.note}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function renderPushbackResponse({ reviewer, responses, findings, verbose }: { reviewer: any; responses: any[]; findings: any[]; verbose: boolean }) {
  const lines = [
    renderSectionHeader({
      title: `${INTERNAL_CONFIG.cli.review.pushbackTitle} from ${reviewer.tool}`,
      tone: "magenta",
    }),
  ];

  if (!verbose) {
    const withdrawn = responses.filter((response) => response.withdrawn);
    const kept = responses.length - withdrawn.length;
    lines.push(`${formatLabel({ label: "Withdrawn" })} ${withdrawn.length}`);
    lines.push(`${formatLabel({ label: "Kept" })} ${kept}`);
    lines.push("");
    for (const response of responses.filter((item) => !item.withdrawn)) {
      const finding = findings.find((item) => item.finding_id === response.finding_id);
      const displayId = finding ? formatFindingDisplayId({ finding }) : formatDisplayId({ text: response.finding_id });
      lines.push(`${displayId} ${finding?.summary ?? response.finding_id}`);
      lines.push(`  ${response.note}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  for (const response of responses) {
    const finding = findings.find((item) => item.finding_id === response.finding_id);
    const tone = response.withdrawn ? "yellow" : "green";
    const disposition = response.withdrawn ? "withdrawn" : "kept";
    const displayId = finding ? formatFindingDisplayId({ finding }) : formatDisplayId({ text: response.finding_id });
    lines.push(
      `${displayId} ${formatBadge({ text: disposition, tone })}`,
    );
    lines.push(`${finding?.summary ?? response.finding_id}`);
    lines.push(`${formatLabel({ label: "Note" })}`);
    lines.push(`  ${response.note}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function renderConsensusSummary({
  implementationReady,
  resolved,
}: {
  implementationReady: any[];
  resolved: any[];
}) {
  const lines = [renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.consensusTitle, tone: "green" })];

  lines.push(`${formatLabel({ label: "Implementation Ready" })} ${implementationReady.length}`);
  for (const finding of implementationReady) {
    lines.push(renderCompactFindingDetail({ finding, tone: "green", includeRecommendation: true }));
  }
  lines.push("");

  lines.push(`${formatLabel({ label: "Withdrawn / Resolved" })} ${resolved.length}`);
  for (const finding of resolved) {
    lines.push(renderCompactFindingDetail({ finding, tone: "yellow" }));
  }
  lines.push("");

  return lines.join("\n");
}

export function renderImplementationResult({ filesTouched }: { filesTouched: string[] }) {
  const lines = [renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.implementationTitle, tone: "green" })];

  lines.push(`${formatLabel({ label: "Files Touched" })}`);
  if (filesTouched.length === 0) {
    lines.push(`  none`);
  } else {
    for (const filePath of filesTouched) {
      lines.push(`  ${filePath}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

export function renderNonConsensusAfterCompletion({ session }: { session: any }) {
  const nonConsensus = (session.findings ?? []).filter((finding) => finding.status === "non_consensus");
  if (nonConsensus.length === 0) {
    return "";
  }

  const lines = [renderSectionHeader({ title: "Remaining Non-Consensus", tone: "red" })];
  lines.push(`${formatLabel({ label: "Count" })} ${nonConsensus.length}`);
  lines.push("");
  for (const finding of nonConsensus) {
    lines.push(renderCompactFindingDetail({ finding, tone: "red", includeRecommendation: true }));
  }
  lines.push(`Use command \`roboreviewer resolve\` to decide how to resolve the above non-consensus item(s).`);
  lines.push("");
  return lines.join("\n");
}
