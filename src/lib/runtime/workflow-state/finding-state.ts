import {
  DECIDED_BY,
  FINDING_STATUSES,
  RESOLUTION_STATUSES,
  ROBOVIEW_OUTCOMES,
} from "../../constants.ts";

export function getImplementationReadyFindings(findings: any[]) {
  return findings.filter(
    (finding) => finding.resolution_status !== RESOLUTION_STATUSES.DISCARDED,
  );
}

export function getIterationFindings({
  session,
  scanIteration,
}: {
  session: any;
  scanIteration: number;
}) {
  return session.findings.filter(
    (finding) => finding.scan_iteration === scanIteration,
  );
}

export function markImplementedFindings({
  findings,
  implementationReady,
}: {
  findings: any[];
  implementationReady: any[];
}) {
  const implementedIds = new Set(
    implementationReady.map((finding) => finding.finding_id),
  );
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
      status: approved
        ? FINDING_STATUSES.IMPLEMENTATION_READY
        : FINDING_STATUSES.RESOLVED,
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
  const seenSignatures = new Set(
    existingFindings.map((finding) => createFindingSignature(finding)),
  );
  return findings.filter(
    (finding) => !seenSignatures.has(createFindingSignature(finding)),
  );
}

function normalizeText(input: string | null | undefined) {
  return (input ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizePath(input: string) {
  return input.replace(/\\/g, "/").trim().toLowerCase();
}
