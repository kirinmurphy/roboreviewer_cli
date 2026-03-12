import {
  renderAuditResults,
  renderAuditStatus,
} from "./render-audit-sections.ts";
import {
  renderConsensusSummary,
  renderImplementationResult,
  renderPeerReview,
  renderPushbackResponse,
  renderReviewerFindings,
} from "./render-review-sections.ts";
import { formatStageLine } from "./helper-functions.ts";

export function renderReviewEvent({ event, verbose = false }: { event: any; verbose?: boolean }) {
  if (typeof event === "string") {
    return `${formatStageLine({ message: event })}\n`;
  }

  if (event.type === "audit_results") {
    return renderAuditResults({ auditRuns: event.auditRuns });
  }

  if (event.type === "audit_status") {
    return renderAuditStatus({
      toolId: event.toolId,
      phase: event.phase,
      result: event.result,
    });
  }

  if (event.type === "reviewer_findings") {
    return renderReviewerFindings({
      reviewer: event.reviewer,
      findings: event.findings,
      verbose,
    });
  }

  if (event.type === "peer_review") {
    return renderPeerReview({
      reviewer: event.reviewer,
      comments: event.comments,
      findings: event.findings,
      verbose,
    });
  }

  if (event.type === "pushback_response") {
    return renderPushbackResponse({
      reviewer: event.reviewer,
      responses: event.responses,
      findings: event.findings,
      verbose,
    });
  }

  if (event.type === "consensus_summary") {
    return renderConsensusSummary({
      implementationReady: event.implementationReady,
      resolved: event.resolved,
    });
  }

  if (event.type === "implementation_result") {
    return renderImplementationResult({
      filesTouched: event.filesTouched,
    });
  }

  return "";
}
