import { EXECUTION_STATUSES, REQUEST_TYPES } from "../constants.ts";

export const REVIEW_FOCUS_AREAS = [
  "Look for concrete correctness, security, maintainability, and performance issues in the provided review scope.",
  "Call out duplicated or redundant logic when it creates clear DRY opportunities or increases maintenance risk.",
  "Call out implementation gaps where a change is only partially applied across related code paths, states, or callers.",
  "Call out optimization opportunities only when they materially improve correctness, maintainability, performance, or operational safety.",
  "Do not propose speculative cleanups or style-only edits unless they materially affect maintainability.",
] as const;

export function buildCommonPromptSections(request: any) {
  const sections = [];

  if (request.reviewerId) {
    sections.push(`Reviewer id: ${request.reviewerId}`);
  }
  if (request.docsText) {
    sections.push(`Documentation context:\n${request.docsText}`);
  }
  if (request.auditText) {
    sections.push(`Audit context:\n${request.auditText}`);
  }
  if (request.auditFindings?.length) {
    sections.push(`Audit findings:\n${JSON.stringify(request.auditFindings, null, 2)}`);
  }
  if (request.commitMessages) {
    sections.push(`Commit metadata:\n${JSON.stringify(request.commitMessages, null, 2)}`);
  }
  if (request.findings) {
    const label = request.type === REQUEST_TYPES.IMPLEMENT
      ? "Accepted findings"
      : request.type === REQUEST_TYPES.PUSHBACK_RESPONSE
        ? "Pushback items"
        : "Peer findings";
    sections.push(`${label}:\n${JSON.stringify(request.findings, null, 2)}`);
  }
  if (request.diffText) {
    sections.push(`Unified diff:\n${request.diffText}`);
  }

  return sections;
}

export function buildReviewFocusSection() {
  return ["Review focus:", ...REVIEW_FOCUS_AREAS.map((item) => `- ${item}`)].join("\n");
}

export function createReviewResponse(result: any) {
  return {
    status: EXECUTION_STATUSES.OK,
    findings: result.findings ?? [],
    audit_assessments: result.audit_assessments ?? [],
    comments: result.comments ?? [],
    usage: {},
    raw: JSON.stringify(result),
  };
}

export function createPushbackResponse(result: any) {
  return {
    status: EXECUTION_STATUSES.OK,
    findings: [],
    comments: result.responses ?? result.comments ?? [],
    usage: {},
    raw: JSON.stringify(result),
  };
}

export function createImplementationResponse(result: any) {
  return {
    status: result.status ?? EXECUTION_STATUSES.OK,
    files_touched: result.files_touched ?? [],
    usage: {},
    raw: JSON.stringify(result),
  };
}
