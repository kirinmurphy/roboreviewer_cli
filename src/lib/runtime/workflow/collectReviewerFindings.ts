import { FINDING_STATUSES, REQUEST_TYPES } from "../../constants.ts";
import { findingId } from "../../ids.ts";
import { createFindingSignature, filterNewFindings } from "../workflow-state/index.ts";
import { emitProgress } from "./helper-functions.ts";

export async function collectReviewerFindings({
  cwd,
  reviewers,
  diffText,
  docsText,
  auditRuns,
  commitMessages,
  existingFindings,
  scanIteration,
  onProgress,
}) {
  const allFindings = [];
  const reviewerResults = [];
  const auditAssessments = [];
  const auditFindings = auditRuns.flatMap((run) => run.findings ?? []);
  const auditText = auditRuns.map((run) => `${run.id}: ${run.advisory ?? run.error ?? ""}`).join("\n\n");

  for (const reviewer of reviewers) {
    emitProgress({
      onProgress,
      message: `Requesting findings from ${reviewer.tool}`,
    });
  }

  const reviewResponses = await Promise.all(
    reviewers.map(async (reviewer) => {
      const result = await reviewer.adapter.execute({
        type: REQUEST_TYPES.REVIEW,
        cwd,
        reviewerId: reviewer.reviewer_id,
        diffText,
        docsText,
        auditText,
        auditFindings,
        commitMessages,
      });

      return { reviewer, result };
    }),
  );

  for (const { reviewer, result } of reviewResponses) {
    const findings = result.findings.map((finding, index) => ({
      ...finding,
      finding_id: `${reviewer.reviewer_id}-raw-${index + 1}`,
      source_reviewer_id: reviewer.reviewer_id,
      source_reviewer_tool: reviewer.tool,
      status: FINDING_STATUSES.OPEN,
      peer_reviews: [],
      pushback_resolution: null,
      related_audit_ids: Array.isArray(finding.related_audit_ids) ? finding.related_audit_ids : [],
      user_approved: null,
      scan_iteration: scanIteration,
      resolution_status: null,
      roboreview_outcome: null,
      decided_by: null,
    }));

    reviewerResults.push({ reviewer, raw: result.raw, findings });
    allFindings.push(...findings);
    auditAssessments.push(
      ...(result.audit_assessments ?? []).map((assessment) => ({
        ...assessment,
        reviewer_id: reviewer.reviewer_id,
        reviewer_tool: reviewer.tool,
      })),
    );
  }

  const dedupedFindings = dedupeFindings(allFindings);
  const newFindings = filterNewFindings({
    findings: dedupedFindings,
    existingFindings,
  }).map((finding, index) => ({
    ...finding,
    finding_id: findingId({
      scanIteration,
      index: index + 1,
      reviewerTool: finding.source_reviewer_tool ?? finding.source_reviewer_id,
    }),
  }));
  const findingsBySignature = new Map(newFindings.map((finding) => [createFindingSignature(finding), finding]));

  for (const reviewerResult of reviewerResults) {
    emitProgress({
      onProgress,
      message: {
        type: "reviewer_findings",
        reviewer: reviewerResult.reviewer,
        findings: mapRawFindingsToFinalFindings({
          rawFindings: reviewerResult.findings,
          findingsBySignature,
        }),
      },
    });
  }

  return {
    reviewerResults,
    findings: newFindings,
    auditAssessments,
    rawFindingCount: allFindings.length,
  };
}

function dedupeFindings(findings: any[]) {
  const deduped = [];
  const seen = new Map();

  for (const finding of findings) {
    const key = createFindingSignature(finding);

    if (!seen.has(key)) {
      seen.set(key, {
        ...finding,
        merged_from: [finding.finding_id],
        attribution: [finding.source_reviewer_tool ?? finding.source_reviewer_id],
      });
      deduped.push(seen.get(key));
      continue;
    }

    const existing = seen.get(key);
    existing.merged_from.push(finding.finding_id);
    const attributionLabel = finding.source_reviewer_tool ?? finding.source_reviewer_id;
    if (!existing.attribution.includes(attributionLabel)) {
      existing.attribution.push(attributionLabel);
    }
  }

  return deduped;
}

function mapRawFindingsToFinalFindings({
  rawFindings,
  findingsBySignature,
}: {
  rawFindings: any[];
  findingsBySignature: Map<string, any>;
}) {
  const mapped = [];
  const seenFindingIds = new Set();

  for (const rawFinding of rawFindings) {
    const finalFinding = findingsBySignature.get(createFindingSignature(rawFinding));
    if (!finalFinding || seenFindingIds.has(finalFinding.finding_id)) {
      continue;
    }
    seenFindingIds.add(finalFinding.finding_id);
    mapped.push(finalFinding);
  }

  return mapped;
}
