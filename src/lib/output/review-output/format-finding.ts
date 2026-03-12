import {
  formatDisplayId,
  formatMultilineBlock,
  formatLabel,
  formatLocation,
  formatSeverityBadge,
  summarizeText,
} from "./helper-functions.ts";

export function formatFindingDisplayId({ finding }: { finding: any }) {
  return formatDisplayId({ text: finding.finding_id });
}

export function renderFindingBlock({ finding, includeRecommendation }: { finding: any; includeRecommendation: boolean }) {
  const lines = [
    `${formatFindingDisplayId({ finding })} ${formatSeverityBadge({ finding })}`,
    formatLocation({ finding }),
    formatMultilineBlock({ text: finding.summary, indentLevel: 0 }),
  ];

  if (includeRecommendation && finding.recommendation) {
    lines.push(`${formatLabel({ label: "Recommendation" })}`);
    lines.push(formatMultilineBlock({ text: finding.recommendation, indentLevel: 1 }));
  }

  lines.push("");
  return lines.join("\n");
}

export function renderCompactFindingDetail({
  finding,
  tone,
  includeRecommendation = true,
}: {
  finding: any;
  tone?: "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "gray";
  includeRecommendation?: boolean;
}) {
  const lines = [
    `${formatFindingDisplayId({ finding })} ${formatSeverityBadge({ finding })}`,
    formatLocation({ finding }),
    formatMultilineBlock({ text: summarizeText({ text: finding.summary, limit: 320 }), indentLevel: 0 }),
  ];

  if (includeRecommendation && finding.recommendation) {
    lines.push(`${formatLabel({ label: "Recommendation" })}`);
    lines.push(formatMultilineBlock({ text: summarizeText({ text: finding.recommendation, limit: 320 }), indentLevel: 1 }));
  }

  lines.push("");
  return lines.join("\n");
}

export function summarizeSourceReviewers({ comments, findings }: { comments: any[]; findings: any[] }) {
  const reviewerTools = comments
    .map((comment) => findings.find((finding) => finding.finding_id === comment.finding_id)?.source_reviewer_tool)
    .filter(Boolean);
  const uniqueTools = [...new Set(reviewerTools)];
  if (uniqueTools.length === 0) {
    return "unknown reviewer";
  }
  return uniqueTools.join(", ");
}
