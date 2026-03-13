import path from "node:path";

export const SCHEMA_VERSION = 1;
export const CONFIG_DIR = ".roboreviewer";
export const RUNTIME_DIR = path.join(CONFIG_DIR, "runtime");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
export const SESSION_PATH = path.join(RUNTIME_DIR, "session.json");
export const HISTORY_DIR = path.join(RUNTIME_DIR, "history");
export const TMP_DIR = path.join(RUNTIME_DIR, "tmp");
export const DEFAULT_MAX_DOCS_BYTES = 200000;

export const SUPPORTED_AGENT_TOOLS = ["claude-code", "codex", "mock"] as const;
export const SUPPORTED_AUDIT_TOOLS = ["coderabbit"] as const;

export const AGENT_TOOLS = {
  CLAUDE_CODE: "claude-code",
  CODEX: "codex",
  MOCK: "mock",
} as const;

export const AUDIT_TOOLS = {
  CODERABBIT: "coderabbit",
} as const;

export const CLI_COMMANDS = {
  INIT: "init",
  REVIEW: "review",
  RESUME: "resume",
} as const;

export const DEFAULT_AUTO_UPDATE = true;

export const REVIEW_IMPLEMENTATION_MODES = {
  AUTO_APPROVE_CONSENSUS: "auto_approve_consensus",
  MANUAL_APPROVE_EACH: "manual_approve_each",
} as const;

export const REVIEW_IMPLEMENTATION_MODE_LABELS = {
  AUTO_APPROVE_CONSENSUS:
    "Have recommendations implemented automatically when all roboreviewers agree",
  MANUAL_APPROVE_EACH:
    "Manually review each recommendation and approve or deny each change",
} as const;

export const POST_REVIEW_ACTIONS = {
  REPEAT_SCAN: "repeat_scan",
  END_SCAN: "end_scan",
} as const;

export const POST_REVIEW_ACTION_LABELS = {
  REPEAT_SCAN: "Scan the code again to look for additional issues",
  END_SCAN: "End Scan",
} as const;

export const REQUEST_TYPES = {
  REVIEW: "review",
  PEER_REVIEW: "peer_review",
  PUSHBACK_RESPONSE: "pushback_response",
  IMPLEMENT: "implement",
} as const;

export const AUDIT_ASSESSMENT_DISPOSITIONS = {
  ADOPT: "adopt",
  REJECT: "reject",
} as const;

export const EXECUTION_STATUSES = {
  OK: "ok",
  ERROR: "error",
  PARTIAL: "partial",
} as const;

export const SESSION_STATUSES = {
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETE: "complete",
  FAILED: "failed",
} as const;

export const CURSOR_PHASES = {
  MANUAL_CONSENSUS_APPROVAL: "manual_consensus_approval",
  HITL_RESOLUTION: "hitl_resolution",
  FINAL_IMPLEMENTATION: "final_implementation",
} as const;

export const FINDING_STATUSES = {
  OPEN: "open",
  RESOLVED: "resolved",
  NON_CONSENSUS: "non_consensus",
  IMPLEMENTATION_READY: "implementation_ready",
  IMPLEMENTED: "implemented",
} as const;

export const CONFLICT_STATUSES = {
  UNRESOLVED: "unresolved",
  RESOLVED: "resolved",
} as const;

export const HUMAN_DECISIONS = {
  IMPLEMENT_DISPUTED_RECOMMENDATION: "implement_disputed_recommendation",
  DISCARD_DISPUTED_RECOMMENDATION: "discard_disputed_recommendation",
} as const;

export const HUMAN_DECISION_LABELS = {
  IMPLEMENT_DISPUTED_RECOMMENDATION: "Implement Disputed Recommendation",
  DISCARD_DISPUTED_RECOMMENDATION: "Discard Disputed Recommendation",
} as const;

export const REVIEW_STANCES = {
  AGREE: "agree",
  PUSHBACK: "pushback",
} as const;

export const REVIEWER_ROLES = {
  DIRECTOR: "director",
  REVIEWER: "reviewer",
} as const;

export const REVIEWER_IDS = {
  PRIMARY: "reviewer-1",
  SECONDARY: "reviewer-2",
} as const;

export const AUDIT_FINDING_STATUSES = {
  ADOPTED: "adopted",
  NOT_ADOPTED: "not_adopted",
} as const;

export const IMPLEMENTATION_PHASES = {
  REVIEW: "review",
  RESOLVE: "resolve",
} as const;

export const RESOLUTION_STATUSES = {
  IMPLEMENTED: "implemented",
  DISCARDED: "discarded",
} as const;

export const ROBOVIEW_OUTCOMES = {
  CONSENSUS: "consensus",
  NON_CONSENSUS: "non_consensus",
} as const;

export const DECIDED_BY = {
  ROBOREVIEWER: "roboreviewer",
  USER: "user",
} as const;
