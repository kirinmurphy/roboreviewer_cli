import {
  CONFLICT_STATUSES,
  DECIDED_BY,
  FINDING_STATUSES,
  IMPLEMENTATION_PHASES,
  ROBOVIEW_OUTCOMES,
  RESOLUTION_STATUSES,
} from "../../constants.ts";
import { conflictId } from "../../ids.ts";
export { buildTrackedAuditFindings } from "./buildTrackedAuditFindings.ts";

export function getImplementationReadyFindings(findings: any[]) {
  return findings.filter((finding) => finding.resolution_status !== RESOLUTION_STATUSES.DISCARDED);
}

export function createConflicts({ findings, startIndex = 0 }: { findings: any[]; startIndex?: number }) {
  return findings
    .filter((finding) => finding.roboreview_outcome === ROBOVIEW_OUTCOMES.NON_CONSENSUS)
    .map((finding, index) => ({
      conflict_id: conflictId(startIndex + index + 1),
      finding_id: finding.finding_id,
      status: CONFLICT_STATUSES.UNRESOLVED,
      human_decision: null,
    }));
}

export function markImplementedFindings({
  findings,
  implementationReady,
}: {
  findings: any[];
  implementationReady: any[];
}) {
  const implementedIds = new Set(implementationReady.map((finding) => finding.finding_id));
  return findings.map((finding) => {
    if (!implementedIds.has(finding.finding_id)) {
      return finding;
    }

    return {
      ...finding,
      status: FINDING_STATUSES.IMPLEMENTED,
      resolution_status: RESOLUTION_STATUSES.IMPLEMENTED,
    };
  });
}


export function applyConsensusApprovalDecisions({
  findings,
  approvalByFindingId,
  autoUpdate,
}: {
  findings: any[];
  approvalByFindingId: Map<string, boolean>;
  autoUpdate: boolean;
}) {
  return findings.map((finding) => {
    if (finding.roboreview_outcome !== ROBOVIEW_OUTCOMES.CONSENSUS) {
      return finding;
    }

    if (autoUpdate) {
      return {
        ...finding,
        user_approved: null,
        decided_by: DECIDED_BY.ROBOREVIEWER,
      };
    }

    const approved = approvalByFindingId.get(finding.finding_id) === true;
    return {
      ...finding,
      user_approved: approved,
      decided_by: DECIDED_BY.USER,
      resolution_status: approved ? null : RESOLUTION_STATUSES.DISCARDED,
      status: approved ? FINDING_STATUSES.IMPLEMENTATION_READY : FINDING_STATUSES.RESOLVED,
    };
  });
}

export function applyConflictResolutionDecisions({
  findings,
  conflicts,
}: {
  findings: any[];
  conflicts: any[];
}) {
  const implementIds = new Set(
    conflicts
      .filter((conflict) => conflict.human_decision === "implement_disputed_recommendation")
      .map((conflict) => conflict.finding_id),
  );

  return findings.map((finding) => {
    if (finding.roboreview_outcome !== ROBOVIEW_OUTCOMES.NON_CONSENSUS) {
      return finding;
    }

    if (implementIds.has(finding.finding_id)) {
      return {
        ...finding,
        decided_by: DECIDED_BY.USER,
        resolution_status: null,
        status: FINDING_STATUSES.IMPLEMENTATION_READY,
      };
    }

    return {
      ...finding,
      decided_by: DECIDED_BY.USER,
      resolution_status: RESOLUTION_STATUSES.DISCARDED,
      status: FINDING_STATUSES.RESOLVED,
    };
  });
}

export function createFindingSignature(finding: any) {
  return [
    normalizePath(finding.location?.file ?? ""),
    normalizeText(finding.summary),
    normalizeText(finding.recommendation),
    normalizeText(finding.evidence ?? ""),
  ].join("|");
}

export function filterNewFindings({
  findings,
  existingFindings,
}: {
  findings: any[];
  existingFindings: any[];
}) {
  const seenSignatures = new Set(existingFindings.map((finding) => createFindingSignature(finding)));
  return findings.filter((finding) => !seenSignatures.has(createFindingSignature(finding)));
}

export function getNextPendingConflictIndex(conflicts: any[]) {
  return conflicts.findIndex((conflict) => conflict.status !== CONFLICT_STATUSES.RESOLVED);
}

export function resolveConflicts(conflicts: any[]) {
  return conflicts.map((conflict) => ({
    ...conflict,
    status: CONFLICT_STATUSES.RESOLVED,
  }));
}

export function createImplementationRun({
  phase,
  implementation,
}: {
  phase: string;
  implementation: { filesTouched: string[]; raw: string };
}) {
  return {
    phase,
    files_touched: implementation.filesTouched,
    raw: implementation.raw,
  };
}

export const WORKFLOW_PHASES = {
  REVIEW: IMPLEMENTATION_PHASES.REVIEW,
  RESOLVE: IMPLEMENTATION_PHASES.RESOLVE,
} as const;

function normalizeText(input: string | null | undefined) {
  return (input ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizePath(input: string) {
  return input.replace(/\\/g, "/").trim().toLowerCase();
}
