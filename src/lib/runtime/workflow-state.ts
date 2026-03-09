import {
  AUDIT_FINDING_STATUSES,
  CONFLICT_STATUSES,
  FINDING_STATUSES,
  IMPLEMENTATION_PHASES,
} from "../constants.ts";
import { conflictId } from "../ids.ts";

export function getImplementationReadyFindings(findings: any[]) {
  return findings.filter((finding) => finding.status === FINDING_STATUSES.IMPLEMENTATION_READY);
}

export function createConflicts(findings: any[]) {
  return findings
    .filter((finding) => finding.status === FINDING_STATUSES.NON_CONSENSUS)
    .map((finding, index) => ({
      conflict_id: conflictId(index + 1),
      finding_id: finding.finding_id,
      status: CONFLICT_STATUSES.UNRESOLVED,
      human_decision: null,
    }));
}

export function markImplementedFindings({ findings, implementationReady }: { findings: any[]; implementationReady: any[] }) {
  const implementedIds = new Set(implementationReady.map((finding) => finding.finding_id));
  return findings.map((finding) => {
    if (implementedIds.has(finding.finding_id)) {
      return { ...finding, status: FINDING_STATUSES.IMPLEMENTED };
    }
    return finding;
  });
}

export function buildTrackedAuditFindings({
  auditFindings,
  findings,
  auditAssessments,
}: {
  auditFindings: any[];
  findings: any[];
  auditAssessments: any[];
}) {
  const linkedFindingsByAuditId = new Map();
  for (const finding of findings) {
    for (const auditId of finding.related_audit_ids ?? []) {
      const bucket = linkedFindingsByAuditId.get(auditId) ?? [];
      bucket.push(finding);
      linkedFindingsByAuditId.set(auditId, bucket);
    }
  }

  const assessmentsByAuditId = new Map();
  for (const assessment of auditAssessments ?? []) {
    const bucket = assessmentsByAuditId.get(assessment.audit_finding_id) ?? [];
    bucket.push(assessment);
    assessmentsByAuditId.set(assessment.audit_finding_id, bucket);
  }

  return auditFindings.map((auditFinding) => {
    const linkedFindings = linkedFindingsByAuditId.get(auditFinding.audit_finding_id) ?? [];
    const adoptedBy = linkedFindings.map((finding) => finding.finding_id);
    const reviewerAssessments = assessmentsByAuditId.get(auditFinding.audit_finding_id) ?? [];
    return {
      ...auditFinding,
      status: adoptedBy.length > 0 ? AUDIT_FINDING_STATUSES.ADOPTED : AUDIT_FINDING_STATUSES.NOT_ADOPTED,
      adopted_by: adoptedBy,
      reviewer_assessments: reviewerAssessments,
      not_adopted_reason:
        adoptedBy.length > 0 ? null : buildNotAdoptedReason({ auditFinding, linkedFindings, reviewerAssessments }),
    };
  });
}

function buildNotAdoptedReason({
  auditFinding,
  linkedFindings,
  reviewerAssessments,
}: {
  auditFinding: any;
  linkedFindings: any[];
  reviewerAssessments: any[];
}) {
  const rejectedAssessments = reviewerAssessments.filter((assessment) => assessment.disposition === "reject");
  const rejectionNote = rejectedAssessments.map((assessment) => assessment.note).find(Boolean);

  if (linkedFindings.length === 0) {
    if (rejectionNote) {
      return rejectionNote;
    }
    if (auditFinding.file) {
      return `The reviewers did not find this issue actionable in ${auditFinding.file}.`;
    }
    return "The reviewers did not find this issue actionable.";
  }

  const withdrawn = linkedFindings.filter((finding) => finding.pushback_resolution?.withdrawn);
  if (withdrawn.length === linkedFindings.length) {
    const note = withdrawn
      .map((finding) => finding.pushback_resolution?.note)
      .find(Boolean);
    return note
      ? `Withdrawn after peer review: ${note}`
      : "Withdrawn after peer review.";
  }

  const nonConsensus = linkedFindings.filter((finding) => finding.status === FINDING_STATUSES.NON_CONSENSUS);
  if (nonConsensus.length > 0) {
    const note = nonConsensus
      .flatMap((finding) => finding.peer_reviews ?? [])
      .map((review) => review.note)
      .find(Boolean);
    return note ?? "Raised by a reviewer, but it did not reach consensus.";
  }

  const resolved = linkedFindings.filter((finding) => finding.status === FINDING_STATUSES.RESOLVED);
  if (resolved.length > 0) {
    const assessmentNote = rejectedAssessments.map((assessment) => assessment.note).find(Boolean);
    const note = resolved
      .map((finding) => finding.pushback_resolution?.note)
      .find(Boolean);
    return note ?? assessmentNote ?? "Raised by a reviewer, but it was resolved without being implemented.";
  }

  return "Raised during review, but it was not selected for implementation.";
}

export function resolveFindingsAfterHumanDecision({ findings, implementFindings }: { findings: any[]; implementFindings: any[] }) {
  const implementedIds = new Set(implementFindings.map((finding) => finding.finding_id));
  return findings.map((finding) => {
    if (implementedIds.has(finding.finding_id)) {
      return { ...finding, status: FINDING_STATUSES.IMPLEMENTED };
    }
    if (finding.status === FINDING_STATUSES.NON_CONSENSUS) {
      return { ...finding, status: FINDING_STATUSES.RESOLVED };
    }
    return finding;
  });
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
