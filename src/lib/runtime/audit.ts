import {
  AUDIT_FINDING_STATUSES,
  AUDIT_TOOLS,
  EXECUTION_STATUSES,
} from "../constants.ts";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
        const reviewStartedAtMs = Date.now();
        const result = await runCommand({
          command: AUDIT_TOOLS.CODERABBIT,
          args,
          cwd,
        });
        const persistedFindings = await loadPersistedCodeRabbitFindings({
          toolId: tool.id,
          reviewStartedAtMs,
        });
        const auditResult = {
          id: tool.id,
          status: EXECUTION_STATUSES.OK,
          advisory: result.stdout.trim(),
          findings:
            persistedFindings.length > 0
              ? persistedFindings
              : parseAuditFindings({
                  toolId: tool.id,
                  advisory: result.stdout.trim(),
                }),
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

export function parsePersistedCodeRabbitReviewFiles({
  toolId,
  reviewFiles,
}: {
  toolId: string;
  reviewFiles: any[];
}) {
  return reviewFiles
    .filter((reviewFile) => reviewFile && reviewFile.fileName && reviewFile.title)
    .sort((left, right) => {
      const leftTimestamp = Number(left.timestamp ?? 0);
      const rightTimestamp = Number(right.timestamp ?? 0);
      return leftTimestamp - rightTimestamp;
    })
    .map((reviewFile, index) => ({
      audit_finding_id: `${toolId}-a-${String(index + 1).padStart(3, "0")}`,
      tool_id: toolId,
      file: String(reviewFile.fileName),
      summary: normalizePersistedReviewTitle({ title: String(reviewFile.title) }),
      raw_text: normalizePersistedReviewComment({ reviewFile }),
      severity: normalizePersistedReviewSeverity({ reviewFile }),
      indicator_type: normalizePersistedIndicatorType({
        indicatorTypes: reviewFile.indicatorTypes,
      }),
      finding_type:
        typeof reviewFile.type === "string" ? reviewFile.type : null,
      status: AUDIT_FINDING_STATUSES.NOT_ADOPTED,
      adopted_by: [],
    }));
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
    indicator_type: null,
    finding_type: null,
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
    indicator_type: null,
    finding_type: null,
    status: AUDIT_FINDING_STATUSES.NOT_ADOPTED,
    adopted_by: [],
  }));
}

async function loadPersistedCodeRabbitFindings({
  toolId,
  reviewStartedAtMs,
}: {
  toolId: string;
  reviewStartedAtMs: number;
}) {
  const reviewPath = await resolvePersistedCodeRabbitReviewPath({
    reviewStartedAtMs,
  });
  if (!reviewPath) {
    return [];
  }

  const reviewFiles = await readPersistedCodeRabbitReviewFiles({ reviewPath });
  return parsePersistedCodeRabbitReviewFiles({ toolId, reviewFiles });
}

async function resolvePersistedCodeRabbitReviewPath({
  reviewStartedAtMs,
}: {
  reviewStartedAtMs: number;
}) {
  const logDir = path.join(os.homedir(), ".coderabbit", "logs");
  let logFiles = [];

  try {
    logFiles = (await fs.readdir(logDir))
      .map((fileName) => path.join(logDir, fileName))
      .sort()
      .reverse();
  } catch {
    return null;
  }

  for (const logFilePath of logFiles) {
    let stats;
    try {
      stats = await fs.stat(logFilePath);
    } catch {
      continue;
    }

    if (stats.mtimeMs + 1000 < reviewStartedAtMs) {
      continue;
    }

    const persistedPath = await extractPersistedReviewPathFromLog({
      logFilePath,
      reviewStartedAtMs,
    });
    if (persistedPath) {
      return persistedPath;
    }
  }

  return null;
}

async function extractPersistedReviewPathFromLog({
  logFilePath,
  reviewStartedAtMs,
}: {
  logFilePath: string;
  reviewStartedAtMs: number;
}) {
  let text;
  try {
    text = await fs.readFile(logFilePath, "utf8");
  } catch {
    return null;
  }

  const lines = text.split("\n").reverse();
  for (const line of lines) {
    if (!line.includes("Successfully persisted review data with")) {
      continue;
    }

    try {
      const parsed = JSON.parse(line);
      const timestampMs = Date.parse(parsed.timestamp ?? "");
      if (Number.isFinite(timestampMs) && timestampMs + 1000 < reviewStartedAtMs) {
        continue;
      }
      const match = String(parsed.message).match(
        /Successfully persisted review data with \d+ comments to (.+)$/,
      );
      if (match) {
        return match[1];
      }
    } catch {
      const match = line.match(
        /Successfully persisted review data with \d+ comments to ([^"]+)/,
      );
      if (match) {
        return match[1];
      }
    }
  }

  return null;
}

async function readPersistedCodeRabbitReviewFiles({
  reviewPath,
}: {
  reviewPath: string;
}) {
  const ignoredFiles = new Set([
    "diff.json",
    "incrementalDiff.json",
    "git.json",
    "internalState.json",
  ]);

  let fileNames = [];
  try {
    fileNames = await fs.readdir(reviewPath);
  } catch {
    return [];
  }

  const reviewFiles = [];
  for (const fileName of fileNames.sort()) {
    if (!fileName.endsWith(".json") || ignoredFiles.has(fileName)) {
      continue;
    }

    try {
      const fileText = await fs.readFile(path.join(reviewPath, fileName), "utf8");
      reviewFiles.push(JSON.parse(fileText));
    } catch {
      continue;
    }
  }

  return reviewFiles;
}

function normalizePersistedReviewTitle({ title }: { title: string }) {
  return title
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePersistedReviewComment({ reviewFile }: { reviewFile: any }) {
  const commentText =
    typeof reviewFile.comment === "string" && reviewFile.comment.trim()
      ? reviewFile.comment
      : reviewFile.title;

  return commentText
    .replace(/\r\n/g, "\n")
    .replace(/^\*\*(.+?)\*\*\n\n/, "$1\n\n")
    .trim();
}

function normalizePersistedReviewSeverity({ reviewFile }: { reviewFile: any }) {
  if (typeof reviewFile.severity === "string") {
    return reviewFile.severity;
  }

  return null;
}

function normalizePersistedIndicatorType({
  indicatorTypes,
}: {
  indicatorTypes: unknown;
}) {
  if (!Array.isArray(indicatorTypes) || indicatorTypes.length === 0) {
    return null;
  }

  const primaryIndicator = indicatorTypes.find(
    (indicatorType) => typeof indicatorType === "string" && indicatorType.trim(),
  );
  return typeof primaryIndicator === "string" ? primaryIndicator : null;
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
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const severityValue = extractAuditSeverityValue({ line });
    if (severityValue) {
      return severityValue;
    }
  }

  return null;
}

function extractAuditSeverityValue({ line }: { line: string }) {
  const match = line.match(/^\**severity\**\s*[:=-]\s*(.+)$/i);
  if (!match) {
    return null;
  }

  const normalized = match[1]
    .trim()
    .toLowerCase()
    .replace(/[*_`()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const severity of ["critical", "major", "minor", "trivial"]) {
    if (normalized === severity || normalized.startsWith(`${severity} `)) {
      return severity;
    }
  }

  return null;
}
