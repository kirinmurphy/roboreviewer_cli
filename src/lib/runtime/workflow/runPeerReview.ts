import { DECIDED_BY, FINDING_STATUSES, REQUEST_TYPES, RESOLUTION_STATUSES, REVIEW_STANCES, ROBOVIEW_OUTCOMES } from "../../constants.ts";
import { emitProgress } from "./helper-functions.ts";

export async function runPeerReview({ cwd, reviewers, findings, diffText, onProgress }) {
  if (reviewers.length < 2) {
    emitProgress({
      onProgress,
      message: "Single-reviewer mode detected; skipping peer review",
    });
    return findings.map((finding) => ({
      ...finding,
      roboreview_outcome: ROBOVIEW_OUTCOMES.CONSENSUS,
      decided_by: DECIDED_BY.ROBOREVIEWER,
    }));
  }

  const findingsByReviewer = groupFindingsByReviewer(findings);
  await applyPeerReviewComments({ cwd, reviewers, findings, diffText, onProgress });
  await applyPushbackResolutions({ cwd, reviewers, findings, findingsByReviewer, diffText, onProgress });

  return findings.map((finding) => {
    const hasPushback = finding.peer_reviews.some((review) => review.stance === REVIEW_STANCES.PUSHBACK);
    if (!hasPushback) {
      return {
        ...finding,
        roboreview_outcome: ROBOVIEW_OUTCOMES.CONSENSUS,
        decided_by: DECIDED_BY.ROBOREVIEWER,
      };
    }
    if (finding.pushback_resolution?.withdrawn) {
      return {
        ...finding,
        status: FINDING_STATUSES.RESOLVED,
        resolution_status: RESOLUTION_STATUSES.DISCARDED,
        roboreview_outcome: ROBOVIEW_OUTCOMES.CONSENSUS,
        decided_by: DECIDED_BY.ROBOREVIEWER,
      };
    }
    return {
      ...finding,
      roboreview_outcome: ROBOVIEW_OUTCOMES.NON_CONSENSUS,
    };
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
  }

  const peerReviewResults = await Promise.all(
    reviewers.map(async (reviewer) => {
      const peerFindings = findings.filter((finding) => finding.source_reviewer_id !== reviewer.reviewer_id);
      const result = await reviewer.adapter.execute({
        type: REQUEST_TYPES.PEER_REVIEW,
        cwd,
        reviewerId: reviewer.reviewer_id,
        findings: peerFindings,
        diffText,
      });

      return { reviewer, comments: result.comments };
    }),
  );

  for (const { reviewer, comments } of peerReviewResults) {
    for (const comment of comments) {
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
        comments,
        findings,
      },
    });
  }
}

async function applyPushbackResolutions({ cwd, reviewers, findings, findingsByReviewer, diffText, onProgress }) {
  const reviewersWithPushback = [];

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
    reviewersWithPushback.push({ reviewer, pushedBack });
  }

  const pushbackResponses = await Promise.all(
    reviewersWithPushback.map(async ({ reviewer, pushedBack }) => {
      const result = await reviewer.adapter.execute({
        type: REQUEST_TYPES.PUSHBACK_RESPONSE,
        cwd,
        reviewerId: reviewer.reviewer_id,
        findings: pushedBack,
        diffText,
      });

      return { reviewer, responses: result.comments };
    }),
  );

  for (const { reviewer, responses } of pushbackResponses) {
    for (const response of responses) {
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
        responses,
        findings,
      },
    });
  }
}
