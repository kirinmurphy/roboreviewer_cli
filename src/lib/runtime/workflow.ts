import {
  CONFLICT_STATUSES,
  CURSOR_PHASES,
  FINDING_STATUSES,
  HUMAN_DECISIONS,
  REQUEST_TYPES,
  REVIEWER_IDS,
  REVIEWER_ROLES,
  REVIEW_STANCES,
  SESSION_STATUSES,
} from "../constants.ts";
import { createAdapter } from "../adapters/index.ts";
import { findingId } from "../ids.ts";
import { listChangedFiles } from "../system/git.ts";
import {
  buildTrackedAuditFindings,
  createConflicts,
  createImplementationRun,
  getImplementationReadyFindings,
  markImplementedFindings,
  resolveConflicts,
  resolveFindingsAfterHumanDecision,
  WORKFLOW_PHASES,
} from "./workflow-state.ts";

type WorkflowReviewer = {
  reviewer_id: string;
  tool: string;
  adapter: ReturnType<typeof createAdapter>;
  role: string;
};

export async function runReviewWorkflow({ cwd, config, session, diffText, docsText, auditRuns, commitMessages, onProgress, onCheckpoint }) {
  const reviewers = buildReviewers(config);
  emitProgress({
    onProgress,
    message: `Checking ${reviewers.length} reviewer adapter(s)`,
  });
  for (const reviewer of reviewers) {
    emitProgress({
      onProgress,
      message: `Verifying ${reviewer.tool}`,
    });
    await reviewer.adapter.healthcheck();
    await reviewer.adapter.probeCapabilities();
  }

  emitProgress({
    onProgress,
    message: "Collecting initial reviewer findings",
  });
  const initial = await collectReviewerFindings({
    cwd,
    reviewers,
    diffText,
    docsText,
    auditRuns,
    commitMessages,
    onProgress,
  });
  const auditFindings = auditRuns.flatMap((run) => run.findings ?? []);
  emitProgress({
    onProgress,
    message: "Running peer review and pushback resolution",
  });
  const findings = await runPeerReview({
    cwd,
    reviewers,
    findings: initial.findings,
    diffText,
    onProgress,
  });

  const implementationReady = getImplementationReadyFindings(findings);
  const conflicts = createConflicts(findings);
  session.audit_findings = buildTrackedAuditFindings({
    auditFindings,
    findings,
    auditAssessments: initial.auditAssessments,
  });
  session.findings = findings;
  session.conflicts = conflicts;
  session.review_target.changed_files = await listChangedFiles({ cwd, diffBase: "HEAD" });
  await checkpointSession({ onCheckpoint, session });
  emitProgress({
    onProgress,
    message: {
      type: "consensus_summary",
      implementationReady,
      resolved: findings.filter((finding) => finding.status === FINDING_STATUSES.RESOLVED),
      nonConsensus: findings.filter((finding) => finding.status === FINDING_STATUSES.NON_CONSENSUS),
    },
  });

  emitProgress({
    onProgress,
    message: `Applying ${implementationReady.length} consensus fix(es)`,
  });
  const implementation = await runImplementation({
    cwd,
    director: reviewers[0],
    findings: implementationReady,
    docsText,
    baseRef: "HEAD",
  });
  emitProgress({
    onProgress,
    message: {
      type: "implementation_result",
      filesTouched: implementation.filesTouched,
      findings: implementationReady,
    },
  });

  const finalizedFindings = markImplementedFindings({ findings, implementationReady });
  session.findings = finalizedFindings;
  session.conflicts = conflicts;
  session.review_target.changed_files = await listChangedFiles({ cwd, diffBase: "HEAD" });
  session.iterations.push({
    iteration_num: session.iterations.length + 1,
    reviewer_findings_count: finalizedFindings.length,
    consensus_count: finalizedFindings.filter((finding) => finding.status === FINDING_STATUSES.IMPLEMENTED).length,
    non_consensus_count: conflicts.length,
  });
  session.implementation_runs.push(createImplementationRun({ phase: WORKFLOW_PHASES.REVIEW, implementation }));
  session.cursor = conflicts.length > 0 ? { phase: CURSOR_PHASES.HITL_RESOLUTION, next_conflict_index: 0 } : null;
  session.status = conflicts.length > 0 ? SESSION_STATUSES.PAUSED : SESSION_STATUSES.COMPLETE;
  await checkpointSession({ onCheckpoint, session });
  emitProgress({
    onProgress,
    message:
      conflicts.length > 0
        ? `Review paused with ${conflicts.length} conflict(s) awaiting resolution`
        : "Review workflow completed",
  });

  return session;
}

export async function finalizeResolvedConflicts({ cwd, config, session, docsText }) {
  const director = createAdapter(config.agents.director.tool);
  await director.healthcheck();

  const implementFindings = session.conflicts
    .filter((conflict) => conflict.human_decision === HUMAN_DECISIONS.IMPLEMENT_DISPUTED_RECOMMENDATION)
    .map((conflict) => session.findings.find((finding) => finding.finding_id === conflict.finding_id))
    .filter(Boolean);

  const implementation = await runImplementation({
    cwd,
    director: { adapter: director },
    findings: implementFindings,
    docsText,
    baseRef: "HEAD",
  });

  session.findings = resolveFindingsAfterHumanDecision({
    findings: session.findings,
    implementFindings,
  });
  session.conflicts = resolveConflicts(session.conflicts);
  session.implementation_runs.push(createImplementationRun({ phase: WORKFLOW_PHASES.RESOLVE, implementation }));
  session.review_target.changed_files = await listChangedFiles({ cwd, diffBase: "HEAD" });
  session.cursor = null;
  session.status = SESSION_STATUSES.COMPLETE;

  return session;
}

function buildReviewers(config): WorkflowReviewer[] {
  const directorTool = config.agents.director.tool;
  const reviewers: WorkflowReviewer[] = [
    {
      reviewer_id: REVIEWER_IDS.PRIMARY,
      tool: directorTool,
      adapter: createAdapter(directorTool),
      role: REVIEWER_ROLES.DIRECTOR,
    },
  ];
  const secondaryTool = config.agents.reviewers?.[0]?.tool;
  if (secondaryTool) {
    reviewers.push({
      reviewer_id: REVIEWER_IDS.SECONDARY,
      tool: secondaryTool,
      adapter: createAdapter(secondaryTool),
      role: REVIEWER_ROLES.REVIEWER,
    });
  }
  return reviewers;
}

function normalizeText(input) {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupeFindings(findings) {
  const deduped = [];
  const seen = new Map();

  for (const finding of findings) {
    const key = [
      finding.location?.file ?? "",
      finding.location?.line ?? "",
      normalizeText(finding.summary),
      normalizeText(finding.recommendation),
    ].join("|");

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

async function collectReviewerFindings({ cwd, reviewers, diffText, docsText, auditRuns, commitMessages, onProgress }) {
  let index = 1;
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

    const findings = result.findings.map((finding) => ({
      ...finding,
      finding_id: findingId(index++),
      source_reviewer_id: reviewer.reviewer_id,
      source_reviewer_tool: reviewer.tool,
      status: FINDING_STATUSES.OPEN,
      peer_reviews: [],
      pushback_resolution: null,
      related_audit_ids: Array.isArray(finding.related_audit_ids) ? finding.related_audit_ids : [],
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
    emitProgress({
      onProgress,
      message: {
        type: "reviewer_findings",
        reviewer,
        findings,
      },
    });
  }

  return {
    reviewerResults,
    findings: dedupeFindings(allFindings),
    auditAssessments,
  };
}

async function runPeerReview({ cwd, reviewers, findings, diffText, onProgress }) {
  if (reviewers.length < 2) {
    emitProgress({
      onProgress,
      message: "Single-reviewer mode detected; skipping peer review",
    });
    return findings.map((finding) => ({
      ...finding,
      status: FINDING_STATUSES.IMPLEMENTATION_READY,
    }));
  }

  const findingsByReviewer = groupFindingsByReviewer(findings);
  await applyPeerReviewComments({ cwd, reviewers, findings, diffText, onProgress });
  await applyPushbackResolutions({ cwd, reviewers, findings, findingsByReviewer, diffText, onProgress });

  return findings.map((finding) => {
    const hasPushback = finding.peer_reviews.some((review) => review.stance === REVIEW_STANCES.PUSHBACK);
    if (!hasPushback) {
      return { ...finding, status: FINDING_STATUSES.IMPLEMENTATION_READY };
    }
    if (finding.pushback_resolution?.withdrawn) {
      return { ...finding, status: FINDING_STATUSES.RESOLVED };
    }
    return { ...finding, status: FINDING_STATUSES.NON_CONSENSUS };
  });
}

function groupFindingsByReviewer(findings) {
  const findingsByReviewer = new Map();
  for (const finding of findings) {
    const bucket = findingsByReviewer.get(finding.source_reviewer_id) ?? [];
    bucket.push(finding);
    findingsByReviewer.set(finding.source_reviewer_id, bucket);
  }
  return findingsByReviewer;
}

async function applyPeerReviewComments({ cwd, reviewers, findings, diffText, onProgress }) {
  for (const reviewer of reviewers) {
    const peerFindings = findings.filter((finding) => finding.source_reviewer_id !== reviewer.reviewer_id);
    emitProgress({
      onProgress,
      message: `Running peer review with ${reviewer.tool} on ${peerFindings.length} finding(s)`,
    });
    const result = await reviewer.adapter.execute({
      type: REQUEST_TYPES.PEER_REVIEW,
      cwd,
      reviewerId: reviewer.reviewer_id,
      findings: peerFindings,
      diffText,
    });

    for (const comment of result.comments) {
      const target = findings.find((finding) => finding.finding_id === comment.finding_id);
      if (!target) {
        continue;
      }
      target.peer_reviews.push({
        peer_reviewer_id: reviewer.reviewer_id,
        peer_reviewer_tool: reviewer.tool,
        stance: comment.stance,
        note: comment.note,
      });
    }

    emitProgress({
      onProgress,
      message: {
        type: "peer_review",
        reviewer,
        comments: result.comments,
        findings,
      },
    });
  }
}

async function applyPushbackResolutions({ cwd, reviewers, findings, findingsByReviewer, diffText, onProgress }) {
  for (const reviewer of reviewers) {
    const pushedBack = (findingsByReviewer.get(reviewer.reviewer_id) ?? []).filter((finding) =>
      finding.peer_reviews.some((review) => review.stance === REVIEW_STANCES.PUSHBACK),
    );

    if (pushedBack.length === 0) {
      continue;
    }

    emitProgress({
      onProgress,
      message: `Requesting pushback response from ${reviewer.tool} for ${pushedBack.length} finding(s)`,
    });
    const result = await reviewer.adapter.execute({
      type: REQUEST_TYPES.PUSHBACK_RESPONSE,
      cwd,
      reviewerId: reviewer.reviewer_id,
      findings: pushedBack,
      diffText,
    });

    for (const response of result.comments) {
      const target = findings.find((finding) => finding.finding_id === response.finding_id);
      if (!target) {
        continue;
      }
      target.pushback_resolution = {
        responded_by: reviewer.reviewer_id,
        responded_by_tool: reviewer.tool,
        withdrawn: response.withdrawn,
        note: response.note,
      };
    }

    emitProgress({
      onProgress,
      message: {
        type: "pushback_response",
        reviewer,
        responses: result.comments,
        findings,
      },
    });
  }
}

async function runImplementation({ cwd, director, findings, docsText, baseRef }) {
  if (findings.length === 0) {
    return {
      filesTouched: [],
      raw: "no-op",
    };
  }

  const result = await director.adapter.execute({
    type: REQUEST_TYPES.IMPLEMENT,
    cwd,
    findings,
    docsText,
  });
  const filesTouched = await listChangedFiles({ cwd, diffBase: baseRef });
  return {
    filesTouched: filesTouched.length > 0 ? filesTouched : result.files_touched ?? [],
    raw: result.raw,
  };
}

function emitProgress({ onProgress, message }) {
  if (typeof onProgress === "function") {
    onProgress(message);
  }
}

async function checkpointSession({ onCheckpoint, session }) {
  if (typeof onCheckpoint === "function") {
    await onCheckpoint({ session });
  }
}
