import {
  AUDIT_FINDING_STATUSES,
  AUDIT_TOOLS,
  EXECUTION_STATUSES,
} from "../constants.ts";
import { EMPTY_TREE_SHA } from "../system/git.ts";
import { runCommand } from "../system/shell.ts";

export async function runAuditTools(
  {
    cwd,
    auditTools,
    reviewTarget,
    onProgress,
  }: {
    cwd: string;
    auditTools: Array<{ id: string; enabled: boolean }>;
    reviewTarget?: {
      mode: string;
      diffBase?: string;
    };
    onProgress?: (event: unknown) => void;
  },
) {
  const results = [];

  for (const tool of auditTools) {
    if (!tool.enabled) {
      continue;
    }

    if (tool.id === AUDIT_TOOLS.CODERABBIT) {
      emitAuditProgress({
        onProgress,
        message: {
          type: "audit_status",
          toolId: tool.id,
          phase: "starting",
        },
      });
      await runCommand({ command: AUDIT_TOOLS.CODERABBIT, args: ["--help"], cwd });
      try {
        const args = buildCodeRabbitReviewArgs({ reviewTarget });
        const result = await runCommand({
          command: AUDIT_TOOLS.CODERABBIT,
          args,
          cwd,
        });
        const auditResult = {
          id: tool.id,
          status: EXECUTION_STATUSES.OK,
          advisory: result.stdout.trim(),
          findings: parseAuditFindings({ toolId: tool.id, advisory: result.stdout.trim() }),
        };
        results.push(auditResult);
        emitAuditProgress({
          onProgress,
          message: {
            type: "audit_status",
            toolId: tool.id,
            phase: "completed",
            result: auditResult,
          },
        });
      } catch (error) {
        const auditResult = {
          id: tool.id,
          status: EXECUTION_STATUSES.ERROR,
          advisory: "",
          findings: [],
          error: error instanceof Error ? error.message : String(error),
        };
        results.push(auditResult);
        emitAuditProgress({
          onProgress,
          message: {
            type: "audit_status",
            toolId: tool.id,
            phase: "failed",
            result: auditResult,
          },
        });
      }
      continue;
    }

    throw new Error(`Unsupported audit tool: ${tool.id}`);
  }

  return results;
}

export function buildCodeRabbitReviewArgs({ reviewTarget }: { reviewTarget?: { mode: string; diffBase?: string } }) {
  const args = ["review", "--plain"];
  if (
    reviewTarget?.mode === "commit_range" &&
    reviewTarget.diffBase &&
    reviewTarget.diffBase !== EMPTY_TREE_SHA
  ) {
    args.push("--type", "committed", "--base-commit", reviewTarget.diffBase);
  }
  return args;
}

function emitAuditProgress({ onProgress, message }: { onProgress?: (event: unknown) => void; message: unknown }) {
  if (typeof onProgress === "function") {
    onProgress(message);
  }
}

export function parseAuditFindings({ toolId, advisory }: { toolId: string; advisory: string }) {
  const sectionFindings = parseStructuredAuditSections({ toolId, advisory });
  if (sectionFindings.length > 0) {
    return sectionFindings;
  }

  const bulletFindings = parseBulletAuditFindings({ toolId, advisory });
  if (bulletFindings.length > 0) {
    return bulletFindings;
  }

  return [];
}

function parseStructuredAuditSections({ toolId, advisory }: { toolId: string; advisory: string }) {
  const sections = advisory
    .split(/\n={20,}\n/g)
    .map((section) => section.trim())
    .filter(Boolean);

  const findings = sections
    .map((section) => {
      const fileMatch = section.match(/^File:\s+(.+)$/m);
      const commentMatch = section.match(/(?:^|\n)Comment:\s*\n([\s\S]+)$/m);
      const severity = extractAuditSeverity({ section });
      if (!fileMatch || !commentMatch) {
        return null;
      }

      const commentBody = extractCommentBody({ text: commentMatch[1] });
      if (!commentBody) {
        return null;
      }

      return {
        tool_id: toolId,
        file: fileMatch[1].trim(),
        severity,
        summary: summarizeAuditComment({ text: commentBody }),
        raw_text: commentBody,
      };
    })
    .filter(Boolean);

  return findings.map((finding, index) => ({
    audit_finding_id: `${toolId}-a-${String(index + 1).padStart(3, "0")}`,
    tool_id: finding.tool_id,
    file: finding.file,
    summary: finding.summary,
    raw_text: finding.raw_text,
    severity: finding.severity ?? null,
    status: AUDIT_FINDING_STATUSES.NOT_ADOPTED,
    adopted_by: [],
  }));
}

function extractCommentBody({ text }: { text: string }) {
  const stopPatterns = [
    /^Prompt for AI Agent:/i,
    /^Also applies to:/i,
    /^🛡️/,
    /^🛠️/,
    /^🔧/,
    /^📝/,
    /^💡/,
    /^💚/,
  ];
  const lines = text.split("\n");
  const keptLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (stopPatterns.some((pattern) => pattern.test(trimmed))) {
      break;
    }
    keptLines.push(line);
  }

  return keptLines.join("\n").trim();
}

function summarizeAuditComment({ text }: { text: string }) {
  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
  const sentenceMatch = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  const summary = sentenceMatch?.[1] ?? normalized;
  return summary.slice(0, 220);
}

function parseBulletAuditFindings({ toolId, advisory }: { toolId: string; advisory: string }) {
  const lines = advisory
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^(\d+[\).\s]|[-*]\s+)/.test(line))
    .map((line) => line.replace(/^(\d+[\).\s]+|[-*]\s+)/, "").trim())
    .filter((line) => isUsefulAuditBullet({ line }));

  return lines.map((line, index) => ({
    audit_finding_id: `${toolId}-a-${String(index + 1).padStart(3, "0")}`,
    tool_id: toolId,
    file: "",
    summary: line,
    raw_text: line,
    severity: null,
    status: AUDIT_FINDING_STATUSES.NOT_ADOPTED,
    adopted_by: [],
  }));
}

function isUsefulAuditBullet({ line }: { line: string }) {
  if (line.length < 20) {
    return false;
  }

  if (
    /^(Prompt for AI Agent:|File:|Line:|Type:|Comment:|Starting CodeRabbit|Connecting to|Setting up|Analyzing|Reviewing|Review completed:)/i.test(
      line,
    )
  ) {
    return false;
  }

  if (/^(Suggested|Proposed)\s+(fix|addition)/i.test(line)) {
    return false;
  }

  if (/^In @/i.test(line)) {
    return false;
  }

  if (/^[-+]/.test(line)) {
    return false;
  }

  if (/^[\w.$()[\]{}"'`:/,-]+;?$/.test(line) && !/\s/.test(line.replace(/[^\s]/g, ""))) {
    return false;
  }

  return true;
}

function extractAuditSeverity({ section }: { section: string }) {
  const severityMatch = section.match(/^Severity:\s+(.+)$/m);
  if (!severityMatch) {
    return null;
  }
  const normalized = severityMatch[1].trim().toLowerCase();
  return ["critical", "major", "minor", "trivial"].includes(normalized) ? normalized : null;
}
