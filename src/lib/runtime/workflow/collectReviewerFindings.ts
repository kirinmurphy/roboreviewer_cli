import { FINDING_STATUSES, REQUEST_TYPES } from "../../constants.ts";
import { findingId } from "../../ids.ts";
import { createFindingSignature, filterNewFindings } from "../workflow-state/index.ts";
import { emitProgress } from "./helper-functions.ts";
import { trackTokenUsage } from "../track-token-usage.ts";
import { filterAuditFindings, getDefaultAuditFilter, deduplicateAuditFindings } from "./filterAuditFindings.ts";
import { listReviewScopeFiles } from "../../system/git.ts";
import { detectDuplicateFindings, getDuplicateStats } from "./detectDuplicateFindings.ts";

export async function collectReviewerFindings({
  cwd,
  reviewers,
  diffText,
  docsText,
  auditRuns,
  commitMessages,
  existingFindings,
  scanIteration,
  session,
  onProgress,
  diffBase,
}) {
  const allFindings = [];
  const reviewerResults = [];
  const auditAssessments = [];
  const auditFindings = auditRuns.flatMap((run) => run.findings ?? []);
  const auditText = auditRuns.map((run) => `${run.id}: ${run.advisory ?? run.error ?? ""}`).join("\n\n");

  // Deduplicate audit findings across tools (e.g., CodeRabbit + ESLint flagging same issue)
  const { deduplicated: dedupedAuditFindings, stats: dedupStats } = deduplicateAuditFindings(auditFindings);

  if (dedupStats.duplicates > 0) {
    emitProgress({
      onProgress,
      message: `Deduplicated audit findings: ${dedupStats.unique}/${dedupStats.total} (merged ${dedupStats.duplicates} duplicate(s) across tools)`,
    });
  }

  // Pre-filter audit findings to reduce token usage
  const changedFiles = await listReviewScopeFiles({ cwd, diffBase, includeWorktree: false });
  const filterConfig = getDefaultAuditFilter({
    reviewerCount: reviewers.length,
    changedFilesCount: changedFiles.length,
  });
  const { filtered: filteredAuditFindings, stats: filterStats } = filterAuditFindings({
    auditFindings: dedupedAuditFindings,
    changedFiles,
    diffText,
    filter: filterConfig,
  });

  if (filterStats.total > 0) {
    emitProgress({
      onProgress,
      message: `Filtered audit findings: ${filterStats.kept}/${filterStats.total} (removed ${filterStats.removedBelowSeverity} below severity, ${filterStats.removedNotInChangedFiles} not in changed files, ${filterStats.removedAlreadyFixed} already fixed)`,
    });
  }

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
        auditFindings: filteredAuditFindings,  // Use filtered findings
        commitMessages,
      });

      return { reviewer, result };
    }),
  );

  for (const { reviewer, result } of reviewResponses) {
    // Track token usage
    if (session && result.usage) {
      trackTokenUsage({
        session,
        phase: "review",
        usage: result.usage,
      });
    }

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

  // Detect potential duplicates to help reduce peer review load
  const findingsWithDuplicateDetection = detectDuplicateFindings(newFindings);
  const duplicateStats = getDuplicateStats(findingsWithDuplicateDetection);

  if (duplicateStats.potentialDuplicates > 0) {
    emitProgress({
      onProgress,
      message: `Detected ${duplicateStats.potentialDuplicates} potential duplicate finding(s) for review`,
    });
  }

  const findingsBySignature = new Map(
    findingsWithDuplicateDetection.map((finding) => [createFindingSignature(finding), finding])
  );

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
    findings: findingsWithDuplicateDetection,
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
