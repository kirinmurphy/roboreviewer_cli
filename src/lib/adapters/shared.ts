import { EXECUTION_STATUSES, REQUEST_TYPES } from "../constants.ts";
import { estimateTokens, getByteSize } from "../token-estimator.ts";

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
    // Send only essential fields to reduce token usage
    const compact = request.auditFindings.map(f => ({
      id: f.audit_finding_id,
      file: f.file,
      summary: f.summary,
      severity: f.severity,
      // Include merged_from_tools if present (shows cross-tool consensus)
      ...(f.merged_from_tools && { merged_from_tools: f.merged_from_tools })
      // Removed: raw_text, indicator_type, finding_type, status, adopted_by
    }));
    sections.push(`Audit findings:\n${JSON.stringify(compact, null, 2)}`);
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

    // Compact findings for peer review and implementation to reduce token usage
    let findingsToSend = request.findings;

    if (request.type === REQUEST_TYPES.PEER_REVIEW || request.type === REQUEST_TYPES.PUSHBACK_RESPONSE) {
      findingsToSend = request.findings.map(f => ({
        finding_id: f.finding_id,
        category: f.category,
        severity: f.severity,
        location: f.location,
        summary: f.summary,
        recommendation: f.recommendation,
        // Include duplicate detection info if present (helps peer reviewers identify redundant findings)
        ...(f.potential_duplicate_of && { potential_duplicate_of: f.potential_duplicate_of }),
        ...(f.similarity_score && { similarity_score: f.similarity_score }),
        // Include attribution if present (shows cross-reviewer consensus)
        ...(f.attribution && { attribution: f.attribution }),
        // Exclude: source_reviewer_id, source_reviewer_tool, status, peer_reviews, etc.
      }));
    } else if (request.type === REQUEST_TYPES.IMPLEMENT) {
      findingsToSend = request.findings.map(f => ({
        finding_id: f.finding_id,
        location: f.location,
        summary: f.summary,
        recommendation: f.recommendation,
        // Include related_audit_ids for context if present
        ...(f.related_audit_ids?.length && { related_audit_ids: f.related_audit_ids }),
        // Exclude: category, severity, source_reviewer_id, peer_reviews, status, etc.
      }));
    }

    sections.push(`${label}:\n${JSON.stringify(findingsToSend, null, 2)}`);
  }
  if (request.diffText) {
    sections.push(`Unified diff:\n${request.diffText}`);
  }

  return sections;
}

export function buildReviewFocusSection() {
  return ["Review focus:", ...REVIEW_FOCUS_AREAS.map((item) => `- ${item}`)].join("\n");
}

export function createReviewResponse(result: any, inputText?: string) {
  validateReviewResultShape(result);
  const rawOutput = JSON.stringify(result);
  return {
    status: EXECUTION_STATUSES.OK,
    findings: result.findings,
    audit_assessments: result.audit_assessments ?? [],
    comments: result.comments,
    usage: {
      input_tokens: inputText ? estimateTokens(inputText) : 0,
      output_tokens: estimateTokens(rawOutput),
      input_bytes: inputText ? getByteSize(inputText) : 0,
      output_bytes: getByteSize(rawOutput),
    },
    raw: rawOutput,
  };
}

export function createPushbackResponse(result: any, inputText?: string) {
  const rawOutput = JSON.stringify(result);
  return {
    status: EXECUTION_STATUSES.OK,
    findings: [],
    comments: result.responses ?? result.comments ?? [],
    usage: {
      input_tokens: inputText ? estimateTokens(inputText) : 0,
      output_tokens: estimateTokens(rawOutput),
      input_bytes: inputText ? getByteSize(inputText) : 0,
      output_bytes: getByteSize(rawOutput),
    },
    raw: rawOutput,
  };
}

export function createImplementationResponse(result: any, inputText?: string) {
  const rawOutput = JSON.stringify(result);
  return {
    status: result.status ?? EXECUTION_STATUSES.OK,
    files_touched: result.files_touched ?? [],
    usage: {
      input_tokens: inputText ? estimateTokens(inputText) : 0,
      output_tokens: estimateTokens(rawOutput),
      input_bytes: inputText ? getByteSize(inputText) : 0,
      output_bytes: getByteSize(rawOutput),
    },
    raw: rawOutput,
  };
}

function validateReviewResultShape(result: any) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Reviewer response must be a JSON object.");
  }

  // findings and comments are required, audit_assessments is now optional
  for (const key of ["findings", "comments"]) {
    if (!Array.isArray(result[key])) {
      throw new Error(`Reviewer response is missing required array field: ${key}.`);
    }
  }

  // audit_assessments is optional but must be an array if present
  if (result.audit_assessments !== undefined && !Array.isArray(result.audit_assessments)) {
    throw new Error("audit_assessments must be an array if provided.");
  }
}
