import fs from "node:fs/promises";
import path from "node:path";
import { AUDIT_ASSESSMENT_DISPOSITIONS, EXECUTION_STATUSES, REQUEST_TYPES, REVIEW_STANCES } from "../constants.ts";
import { INTERNAL_CONFIG } from "../internal-config.ts";
import { createImplementationResponse, createPushbackResponse, createReviewResponse } from "./shared.ts";

function normalizeLine(input) {
  return input.replace(/^\+/, "");
}

function parseDiff(diffText) {
  const findings = [];
  let currentFile = null;
  let currentLine = 0;

  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length);
      continue;
    }

    if (line.startsWith("@@")) {
      const match = /\+(\d+)/.exec(line);
      currentLine = match ? Number(match[1]) : currentLine;
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      for (const rule of INTERNAL_CONFIG.mockAdapter.reviewRules) {
        if (rule.pattern.test(line)) {
          findings.push({
            rule_key: rule.key,
            category: rule.category,
            severity: rule.severity,
            location: { file: currentFile, line: currentLine },
            summary: rule.summary,
            recommendation: rule.recommendation,
            evidence: normalizeLine(line),
          });
        }
      }
      currentLine += 1;
      continue;
    }

    if (!line.startsWith("-")) {
      currentLine += 1;
    }
  }

  return findings;
}

async function applyMockFixes({ cwd, acceptedFindings }) {
  const findingsByFile = new Map();
  for (const finding of acceptedFindings) {
    const fileFindings = findingsByFile.get(finding.location.file) ?? [];
    fileFindings.push(finding);
    findingsByFile.set(finding.location.file, fileFindings);
  }

  const touched = [];

  for (const [relativePath, fileFindings] of findingsByFile.entries()) {
    const fullPath = path.join(cwd, relativePath);
    let raw = await fs.readFile(fullPath, "utf8");
    const lines = raw.split("\n");
    let changed = false;

    for (const finding of fileFindings.sort((left, right) => right.location.line - left.location.line)) {
      const preferredIndex = finding.location.line - 1;
      const evidence = finding.evidence?.trim();
      let index = preferredIndex;
      let line = lines[index] ?? "";

      if (evidence && line.trim() !== evidence) {
        const foundIndex = lines.findIndex((candidate) => candidate.trim() === evidence);
        if (foundIndex >= 0) {
          index = foundIndex;
          line = lines[index] ?? "";
        }
      }

      if (finding.summary.includes("console.log") && line.includes("console.log(")) {
        lines.splice(index, 1);
        changed = true;
      } else if (finding.summary.includes("debugger") && /\bdebugger;?/.test(line)) {
        lines.splice(index, 1);
        changed = true;
      } else if (
        finding.summary.includes(INTERNAL_CONFIG.mockAdapter.withdrawableSummaryToken) &&
        /\b(?:TODO|FIXME)\b/.test(line)
      ) {
        lines[index] = line.replace(/\b(?:TODO|FIXME)\b/g, "").replace(/\s{2,}/g, " ").trimEnd();
        changed = true;
      }
    }

    if (changed) {
      await fs.writeFile(fullPath, lines.join("\n"), "utf8");
      touched.push(relativePath);
    }
  }

  return touched;
}

export function createMockAdapter(toolId) {
  return {
    id: toolId,
    async healthcheck() {
      return { ok: true };
    },
    async probeCapabilities() {
      return {
        headless: true,
        structuredOutput: true,
      };
    },
    classifyError() {
      return "terminal";
    },
    async execute(request) {
      if (request.type === REQUEST_TYPES.REVIEW) {
        const auditAssessments = (request.auditFindings ?? []).map((auditFinding, index) => ({
          audit_finding_id: auditFinding.audit_finding_id,
          disposition: index === 0 ? AUDIT_ASSESSMENT_DISPOSITIONS.ADOPT : AUDIT_ASSESSMENT_DISPOSITIONS.REJECT,
          note:
            index === 0
              ? "This audit item maps to a concrete issue in the reviewed change."
              : "This audit item is not relevant to the current reviewed change.",
        }));
        return createReviewResponse({
          findings: parseDiff(request.diffText).map((finding, index) => ({
            ...finding,
            related_audit_ids: index === 0 && request.auditFindings?.[0] ? [request.auditFindings[0].audit_finding_id] : [],
          })),
          audit_assessments: auditAssessments,
          comments: [],
        });
      }

      if (request.type === REQUEST_TYPES.PEER_REVIEW) {
        const comments = request.findings.map((finding) => {
          const isLowSeverityStyle =
            finding.category === INTERNAL_CONFIG.mockAdapter.lowSeverityStyleCategory &&
            finding.severity === INTERNAL_CONFIG.mockAdapter.lowSeverityStyleSeverity;
          return {
            finding_id: finding.finding_id,
            peer_reviewer_id: request.reviewerId,
            stance: isLowSeverityStyle ? REVIEW_STANCES.PUSHBACK : REVIEW_STANCES.AGREE,
            note: isLowSeverityStyle
              ? "This looks cosmetic enough to skip unless it blocks the change."
              : "This issue is actionable and should be fixed in the same run.",
          };
        });
        return createReviewResponse({ findings: [], comments });
      }

      if (request.type === REQUEST_TYPES.PUSHBACK_RESPONSE) {
        const responses = request.findings.map((finding) => ({
          finding_id: finding.finding_id,
          withdrawn: finding.summary.includes(INTERNAL_CONFIG.mockAdapter.withdrawableSummaryToken),
          note: finding.summary.includes(INTERNAL_CONFIG.mockAdapter.withdrawableSummaryToken)
            ? "The marker is minor enough to withdraw after pushback."
            : "The finding still matters and should be queued for human resolution.",
        }));
        return createPushbackResponse({ responses });
      }

      if (request.type === REQUEST_TYPES.IMPLEMENT) {
        const filesTouched = await applyMockFixes({
          cwd: request.cwd,
          acceptedFindings: request.findings,
        });
        return createImplementationResponse({ status: EXECUTION_STATUSES.OK, files_touched: filesTouched, raw: "mock-implement" });
      }

      throw new Error(`Unsupported mock request type: ${request.type}`);
    },
  };
}
