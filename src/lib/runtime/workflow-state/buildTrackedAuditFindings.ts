import { AUDIT_FINDING_STATUSES, DECIDED_BY, RESOLUTION_STATUSES, ROBOVIEW_OUTCOMES } from "../../constants.ts";

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
      resolution_status: adoptedBy.length > 0 ? AUDIT_FINDING_STATUSES.ADOPTED : RESOLUTION_STATUSES.DISCARDED,
      decided_by: DECIDED_BY.ROBOREVIEWER,
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

  const nonConsensus = linkedFindings.filter((finding) => finding.roboreview_outcome === ROBOVIEW_OUTCOMES.NON_CONSENSUS);
  if (nonConsensus.length > 0) {
    const note = nonConsensus
      .flatMap((finding) => finding.peer_reviews ?? [])
      .map((review) => review.note)
      .find(Boolean);
    return note ?? "Raised by a reviewer, but it did not reach consensus.";
  }

  const discarded = linkedFindings.filter((finding) => finding.resolution_status === RESOLUTION_STATUSES.DISCARDED);
  if (discarded.length > 0) {
    const assessmentNote = rejectedAssessments.map((assessment) => assessment.note).find(Boolean);
    const note = discarded
      .map((finding) => finding.pushback_resolution?.note)
      .find(Boolean);
    return note ?? assessmentNote ?? "Raised during review, but it was discarded.";
  }

  return "Raised during review, but it was not selected for implementation.";
}
