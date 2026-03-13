import { INTERNAL_CONFIG } from "../../internal-config.ts";

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  red: "\u001B[31m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  blue: "\u001B[34m",
  magenta: "\u001B[35m",
  cyan: "\u001B[36m",
  gray: "\u001B[90m",
  slate: "\u001B[38;5;110m",
  teal: "\u001B[38;5;79m",
} as const;

export function renderSectionHeader({
  title,
  tone,
}: {
  title: string;
  tone: Tone;
}) {
  const divider = "=".repeat(INTERNAL_CONFIG.cli.sectionDividerWidth);
  return [
    "",
    colorize({ text: divider, tone: "gray" }),
    colorize({ text: title, tone, bold: true }),
    colorize({ text: divider, tone: "gray" }),
    "",
  ].join("\n");
}

export function formatStageLine({ message }: { message: string }) {
  return `${formatStageLabel()} ${message}`;
}

export function formatConsensusHeader({
  index,
  total,
  findingId,
}: {
  index: number;
  total: number;
  findingId: string;
}) {
  return colorize({
    text: `[Consensus ${index + 1}/${total}] - ${findingId}`,
    tone: "yellow",
    bold: true,
  });
}

export function formatConflictHeader({
  index,
  total,
  findingId,
}: {
  index: number;
  total: number;
  findingId: string;
}) {
  return colorize({
    text: `[Conflict ${index + 1}/${total}] - ${findingId}`,
    tone: "yellow",
    bold: true,
  });
}

export function formatStageLabel() {
  return colorize({
    text: "[roboreviewer]",
    tone: INTERNAL_CONFIG.cli.valueStyles.stageLabel.tone,
    bold: INTERNAL_CONFIG.cli.valueStyles.stageLabel.bold,
  });
}

export function formatToolLabel({ tool }: { tool: string }) {
  return colorize({ text: tool, tone: "cyan", bold: true });
}

export function formatConfirmPrompt({ message }: { message: string }) {
  return colorize({
    text: message,
    tone: INTERNAL_CONFIG.cli.valueStyles.confirmPrompt.tone,
    bold: INTERNAL_CONFIG.cli.valueStyles.confirmPrompt.bold,
  });
}

export function formatStatus({ status }: { status: string }) {
  if (status === "ok") {
    return formatBadge({ text: status, tone: "green" });
  }
  if (status === "error") {
    return formatBadge({ text: status, tone: "red" });
  }
  return formatBadge({ text: status, tone: "yellow" });
}

export function formatSeverityBadge({ finding }: { finding: any }) {
  const tone = reviewerSeverityTone({ severity: finding.severity });
  return `${formatBadge({ text: `${finding.severity}/${finding.category}`, tone })}`;
}

export function formatAuditSeverityBadge({ severity }: { severity: string }) {
  return formatBadge({ text: severity, tone: auditSeverityTone({ severity }) });
}

export function formatAuditIndicatorBadge({
  indicatorType,
}: {
  indicatorType: string;
}) {
  return formatBadge({
    text: indicatorType,
    tone: auditIndicatorTone({ indicatorType }),
  });
}

export function formatDisplayId({ text }: { text: string }) {
  return colorize({
    text,
    tone: INTERNAL_CONFIG.cli.valueStyles.ids.tone,
    bold: INTERNAL_CONFIG.cli.valueStyles.ids.bold,
  });
}

export function formatBadge({ text, tone }: { text: string; tone: Tone }) {
  return colorize({ text: `[${text}]`, tone, bold: true });
}

export function formatLabel({ label }: { label: string }) {
  return colorize({
    text: `${label}:`,
    tone: INTERNAL_CONFIG.cli.valueStyles.fieldLabel.tone,
    bold: INTERNAL_CONFIG.cli.valueStyles.fieldLabel.bold,
  });
}

export function formatLocation({ finding }: { finding: any }) {
  const location = finding.location
    ? `${finding.location.file}:${finding.location.line}`
    : "unknown";
  return colorize({ text: location, tone: "gray" });
}

export function summarizeText({
  text,
  limit,
}: {
  text: string;
  limit: number;
}) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

export function renderAuditFindingDetail({
  auditFinding,
}: {
  auditFinding: any;
}) {
  const lines = [
    formatDisplayId({
      text: formatAuditFindingDisplayId({
        auditFindingId: auditFinding.audit_finding_id,
      }),
    }),
  ];

  if (auditFinding.severity) {
    lines[0] = `${lines[0]} ${formatAuditSeverityBadge({ severity: auditFinding.severity })}`;
  } else if (auditFinding.indicator_type) {
    lines[0] = `${lines[0]} ${formatAuditIndicatorBadge({ indicatorType: auditFinding.indicator_type })}`;
  }

  if (
    auditFinding.file ||
    extractAuditFilePath({ rawText: auditFinding.raw_text })
  ) {
    lines.push(
      colorize({
        text:
          auditFinding.file ||
          extractAuditFilePath({ rawText: auditFinding.raw_text })!,
        tone: "gray",
      }),
    );
  }

  lines.push(
    summarizeText({
      text: normalizeAuditDescription({ auditFinding }),
      limit: 420,
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

export function formatAuditFindingDisplayId({
  auditFindingId,
}: {
  auditFindingId: string;
}) {
  const match = String(auditFindingId).match(/^(.*?)-a-(\d+)$/);
  if (!match) {
    return auditFindingId;
  }
  const [, toolId, ordinal] = match;
  return `f-${ordinal}-${toolId}`;
}

function reviewerSeverityTone({ severity }: { severity: string }): Tone {
  return (
    INTERNAL_CONFIG.cli.valueStyles.severityBadges.reviewer[severity] ?? "blue"
  );
}

function auditSeverityTone({ severity }: { severity: string }): Tone {
  return (
    INTERNAL_CONFIG.cli.valueStyles.severityBadges.audit[severity] ?? "blue"
  );
}

function auditIndicatorTone({
  indicatorType,
}: {
  indicatorType: string;
}): Tone {
  return (
    INTERNAL_CONFIG.cli.valueStyles.severityBadges.auditIndicators[indicatorType] ??
    "blue"
  );
}

function colorize({
  text,
  tone,
  bold = false,
}: {
  text: string;
  tone: Tone;
  bold?: boolean;
}) {
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

type Tone =
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "gray"
  | "slate"
  | "teal";
