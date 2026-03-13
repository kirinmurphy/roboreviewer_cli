import {
  formatDisplayId,
  formatLabel,
  formatLocation,
  formatSeverityBadge,
  summarizeText,
} from "./helper-functions.ts";

export function formatFindingDisplayId({ finding }: { finding: any }) {
  return formatDisplayId({ text: finding.finding_id });
}

function formatDuplicateWarning({ finding }: { finding: any }): string {
  if (!finding.potential_duplicate_of) {
    return "";
  }

  const similarityPercent = Math.round((finding.similarity_score || 0) * 100);
  const warningIcon = "⚠️";
  const message = `${warningIcon}  Potential duplicate of ${finding.potential_duplicate_of} (${similarityPercent}% similar)`;

  // Gray color for the warning
  if (!process.stdout.isTTY) {
    return message;
  }
  return `\u001B[90m${message}\u001B[0m`;
}

export function renderFindingBlock({
  finding,
  includeRecommendation,
}: {
  finding: any;
  includeRecommendation: boolean;
}) {
  const lines = [
    `${formatFindingDisplayId({ finding })} ${formatSeverityBadge({ finding })}`,
    formatLocation({ finding }),
  ];

  const duplicateWarning = formatDuplicateWarning({ finding });
  if (duplicateWarning) {
    lines.push(duplicateWarning);
  }

  lines.push(finding.summary);

  if (includeRecommendation && finding.recommendation) {
    lines.push(`${formatLabel({ label: "Recommendation" })}`);
    lines.push(finding.recommendation);
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
  ];

  const duplicateWarning = formatDuplicateWarning({ finding });
  if (duplicateWarning) {
    lines.push(duplicateWarning);
  }

  lines.push(summarizeText({ text: finding.summary, limit: 320 }));

  if (includeRecommendation && finding.recommendation) {
    lines.push(`${formatLabel({ label: "Recommendation" })}`);
    lines.push(summarizeText({ text: finding.recommendation, limit: 320 }));
  }

  lines.push("");
  return lines.join("\n");
}

export function summarizeSourceReviewers({
  comments,
  findings,
}: {
  comments: any[];
  findings: any[];
}) {
  const reviewerTools = comments
    .map(
      (comment) =>
        findings.find((finding) => finding.finding_id === comment.finding_id)
          ?.source_reviewer_tool,
    )
    .filter(Boolean);
  const uniqueTools = [...new Set(reviewerTools)];
  if (uniqueTools.length > 0) {
    return uniqueTools.join(", ");
  }

  const fallbackTools = [...new Set(findings.map((finding) => finding.source_reviewer_tool).filter(Boolean))];
  if (fallbackTools.length > 0) {
    return fallbackTools.join(", ");
  }
  return "unknown reviewer";
}
