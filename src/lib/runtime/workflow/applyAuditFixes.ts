import { FINDING_STATUSES, RESOLUTION_STATUSES } from "../../constants.ts";
import { findingId } from "../../ids.ts";
import { emitProgress, runImplementation } from "./helper-functions.ts";

export async function applyAuditFixes({
  cwd,
  director,
  auditRuns,
  auditToolConfigs,
  scanIteration,
  session,
  onProgress,
  onApproveAuditFixes,
}: {
  cwd: string;
  director: any;
  auditRuns: any[];
  auditToolConfigs: any[];
  scanIteration: number;
  session: any;
  onProgress?: (event: unknown) => void;
  onApproveAuditFixes?: (args: { findings: any[] }) => Promise<Map<string, boolean>>;
}) {
  const autoImplementableFindings = [];

  for (const auditRun of auditRuns) {
    const toolConfig = auditToolConfigs.find(c => c.id === auditRun.id);
    if (!toolConfig?.auto_implement?.enabled) {
      continue;
    }

    const findings = auditRun.findings ?? [];
    const autoFixes = findings
      .filter(auditFinding => shouldAutoImplement(auditFinding, toolConfig.auto_implement))
      .map((auditFinding, index) => auditFindingToImplementableFinding({
        auditFinding,
        scanIteration,
        index: autoImplementableFindings.length + index + 1,
      }));

    autoImplementableFindings.push(...autoFixes);
  }

  if (autoImplementableFindings.length === 0) {
    emitProgress({
      onProgress,
      message: "No auto-implementable audit findings detected",
    });
    return {
      implemented: [],
      implementation: null,
    };
  }

  // If approval is required, prompt the user
  let findingsToImplement = autoImplementableFindings;
  if (onApproveAuditFixes) {
    emitProgress({
      onProgress,
      message: `Found ${autoImplementableFindings.length} auto-implementable audit finding(s) - requesting approval`,
    });

    const approvals = await onApproveAuditFixes({ findings: autoImplementableFindings });
    findingsToImplement = autoImplementableFindings.filter(f => approvals.get(f.finding_id) === true);

    if (findingsToImplement.length === 0) {
      emitProgress({
        onProgress,
        message: "No audit fixes approved for implementation",
      });
      return {
        implemented: [],
        implementation: null,
      };
    }

    emitProgress({
      onProgress,
      message: `Approved ${findingsToImplement.length}/${autoImplementableFindings.length} audit fix(es)`,
    });
  }

  emitProgress({
    onProgress,
    message: `Auto-implementing ${findingsToImplement.length} audit finding(s)`,
  });

  const implementation = await runImplementation({
    cwd,
    director,
    findings: findingsToImplement,
    baseRef: "HEAD",
    session,
  });

  emitProgress({
    onProgress,
    message: {
      type: "audit_auto_implementation",
      findings: findingsToImplement,
      filesTouched: implementation.filesTouched,
    },
  });

  return {
    implemented: findingsToImplement,
    implementation,
  };
}

function shouldAutoImplement(auditFinding: any, autoImplementConfig: any) {
  const severityRank = { trivial: 1, minor: 2, major: 3, critical: 4 };
  const minRank = severityRank[autoImplementConfig.min_severity] ?? 2;
  const findingRank = severityRank[auditFinding.severity] ?? 0;

  // Only auto-implement if severity meets threshold
  if (findingRank < minRank) {
    return false;
  }

  // If configured to only apply refactor suggestions, filter by indicator_type
  if (autoImplementConfig.only_refactor_suggestions) {
    return auditFinding.indicator_type === "refactor_suggestion";
  }

  return true;
}

function auditFindingToImplementableFinding({
  auditFinding,
  scanIteration,
  index,
}: {
  auditFinding: any;
  scanIteration: number;
  index: number;
}) {
  return {
    finding_id: findingId({
      scanIteration,
      index,
      reviewerTool: `audit-${auditFinding.tool_id}`,
    }),
    source_reviewer_id: `audit-${auditFinding.tool_id}`,
    source_reviewer_tool: auditFinding.tool_id,
    category: "style",  // Audit findings are typically style/refactor
    severity: mapAuditSeverityToFindingSeverity(auditFinding.severity),
    location: {
      file: auditFinding.file,
      line: null,  // Audit findings often don't have line numbers
    },
    summary: auditFinding.summary,
    recommendation: auditFinding.summary,  // Use summary as recommendation
    related_audit_ids: [auditFinding.audit_finding_id],
    status: FINDING_STATUSES.IMPLEMENTATION_READY,
    peer_reviews: [],
    pushback_resolution: null,
    roboreview_outcome: null,
    decided_by: "audit-auto-implement",
    user_approved: null,
    scan_iteration: scanIteration,
    resolution_status: RESOLUTION_STATUSES.IMPLEMENTED,
  };
}

function mapAuditSeverityToFindingSeverity(auditSeverity: string | null) {
  const severityMap: Record<string, string> = {
    critical: "high",
    major: "high",
    minor: "medium",
    trivial: "low",
  };

  return severityMap[auditSeverity ?? ""] ?? "low";
}
