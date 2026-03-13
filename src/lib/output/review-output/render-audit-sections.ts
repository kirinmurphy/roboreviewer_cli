import { SESSION_PATH } from "../../constants.ts";
import { INTERNAL_CONFIG } from "../../internal-config.ts";
import {
  formatAuditFindingDisplayId,
  formatAuditIndicatorBadge,
  formatAuditSeverityBadge,
  formatBadge,
  formatLabel,
  formatStatus,
  formatToolLabel,
  formatDisplayId,
  renderAuditFindingDetail,
  renderSectionHeader,
} from "./helper-functions.ts";

export function renderAuditResults({ auditRuns }: { auditRuns: any[] }) {
  const lines = [renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.auditTitle, tone: "yellow" })];

  if (auditRuns.length === 0) {
    lines.push("No audit tools configured.");
    lines.push("");
    return lines.join("\n");
  }

  for (const run of auditRuns) {
    lines.push(`${formatToolLabel({ tool: run.id })} ${formatStatus({ status: run.status })}`);
    if (run.error) {
      lines.push(`${formatLabel({ label: "Error" })} ${run.error}`);
      lines.push("");
      continue;
    }
    lines.push(`${formatLabel({ label: "Count" })} ${(run.findings ?? []).length}`);
    lines.push("");
    for (const finding of run.findings ?? []) {
      lines.push(renderAuditFindingDetail({ auditFinding: finding }));
    }
    lines.push(`See ${SESSION_PATH} for the full ${run.id} output.`);
    lines.push("");
  }

  return lines.join("\n");
}

export function renderAuditStatus({ toolId, phase, result }: { toolId: string; phase: string; result?: any }) {
  if (phase === "starting") {
    return [
      renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.auditTitle, tone: "yellow" }),
      `${formatToolLabel({ tool: toolId })} ${formatBadge({ text: "running", tone: "yellow" })}`,
      "",
    ].join("\n");
  }

  if (!result) {
    return "";
  }

  return renderAuditResults({ auditRuns: [result] });
}

export function renderNotAdoptedAuditFindings({ session }: { session: any }) {
  const notAdopted = (session.audit_findings ?? []).filter((finding) => finding.status === "not_adopted");
  if (notAdopted.length === 0) {
    return "";
  }

  const lines = [renderSectionHeader({ title: "CodeRabbit Findings Not Adopted", tone: "yellow" })];
  for (const finding of notAdopted) {
    const displayId = formatDisplayId({ text: formatAuditFindingDisplayId({ auditFindingId: finding.audit_finding_id }) });
    lines.push(
      finding.severity
        ? `${displayId} ${formatAuditSeverityBadge({ severity: finding.severity })}`
        : finding.indicator_type
          ? `${displayId} ${formatAuditIndicatorBadge({ indicatorType: finding.indicator_type })}`
          : displayId,
    );
    lines.push(`${finding.summary}`);
    if (finding.not_adopted_reason) {
      lines.push(`${formatLabel({ label: "Reason" })} ${finding.not_adopted_reason}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
