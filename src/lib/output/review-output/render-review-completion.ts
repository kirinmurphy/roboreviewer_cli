import { SESSION_PATH } from "../../constants.ts";
import { INTERNAL_CONFIG } from "../../internal-config.ts";
import { renderSectionHeader, formatLabel } from "./helper-functions.ts";
import { renderNotAdoptedAuditFindings } from "./render-audit-sections.ts";
import { renderNonConsensusAfterCompletion } from "./render-review-sections.ts";

export function renderReviewCompletion({ session }: { session: any }) {
  return [
    "",
    renderNotAdoptedAuditFindings({ session }),
    renderTokenUsage({ session }),
    renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.completionTitle, tone: "green" }),
    `See ${SESSION_PATH} for full audit details.`,
    renderNonConsensusAfterCompletion({ session }),
  ]
    .filter((section) => section !== "")
    .join("\n");
}

function renderTokenUsage({ session }: { session: any }) {
  if (!session.token_usage) {
    return "";
  }

  const usage = session.token_usage;
  const lines = [
    "",
    renderSectionHeader({ title: "Token Usage Summary", tone: "cyan" }),
  ];

  // Total usage
  lines.push(formatLabel({ label: "Total Input" }) + " " + formatTokenCount(usage.total_input_tokens) +
    colorize({ text: ` (${formatBytes(usage.total_input_bytes)})`, tone: "gray" }));
  lines.push(formatLabel({ label: "Total Output" }) + " " + formatTokenCount(usage.total_output_tokens) +
    colorize({ text: ` (${formatBytes(usage.total_output_bytes)})`, tone: "gray" }));

  const totalTokens = usage.total_input_tokens + usage.total_output_tokens;
  lines.push(formatLabel({ label: "Total Tokens" }) + " " + colorize({
    text: formatNumber(totalTokens),
    tone: "cyan",
    bold: true
  }));

  // By-phase breakdown
  if (usage.by_phase && Object.keys(usage.by_phase).length > 0) {
    lines.push("");
    lines.push(colorize({ text: "By Phase:", tone: "slate", bold: true }));

    const phases = Object.entries(usage.by_phase).sort((a: any, b: any) =>
      b[1].input_tokens - a[1].input_tokens
    );

    for (const [phase, stats] of phases) {
      const phaseStats = stats as any;
      const phaseTotal = phaseStats.input_tokens + phaseStats.output_tokens;
      const percentage = totalTokens > 0 ? ((phaseTotal / totalTokens) * 100).toFixed(1) : "0";

      lines.push(
        `  ${colorize({ text: phase.padEnd(20), tone: "slate" })} ` +
        colorize({ text: formatNumber(phaseTotal), tone: "cyan" }) +
        colorize({ text: ` (${percentage}%)`, tone: "gray" }) +
        colorize({ text: ` × ${phaseStats.call_count}`, tone: "gray" })
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

function formatTokenCount(count: number): string {
  return colorize({ text: formatNumber(count) + " tokens", tone: "cyan" });
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  }
}

// Local colorize function (subset needed for token display)
function colorize({ text, tone, bold = false }: { text: string; tone: string; bold?: boolean }) {
  const ANSI: Record<string, string> = {
    reset: "\u001B[0m",
    bold: "\u001B[1m",
    cyan: "\u001B[36m",
    gray: "\u001B[90m",
    slate: "\u001B[38;5;110m",
  };

  if (!process.stdout.isTTY) {
    return text;
  }

  const parts = [];
  if (bold) {
    parts.push(ANSI.bold);
  }
  if (ANSI[tone]) {
    parts.push(ANSI[tone]);
  }
  parts.push(text);
  parts.push(ANSI.reset);
  return parts.join("");
}
