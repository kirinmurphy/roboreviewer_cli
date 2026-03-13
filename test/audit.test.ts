import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodeRabbitReviewArgs,
  parseAuditFindings,
  parsePersistedCodeRabbitReviewFiles,
} from "../src/lib/runtime/audit.ts";
import { createSession } from "../src/lib/runtime/session.ts";

test("parseAuditFindings keeps CodeRabbit comment blocks and drops patch/proposal fragments", () => {
  const advisory = [
    "Starting CodeRabbit review in plain text mode...",
    "",
    "============================================================================",
    "File: src/example.ts",
    "Line: 10 to 14",
    "Type: potential_issue",
    "Severity: major",
    "",
    "Comment:",
    "Missing error handling contradicts the non-throwing contract.",
    "",
    "The helper claims it never throws, but the awaited DB call can still reject and bubble out.",
    "",
    "🛡️ Proposed fix to honor the contract",
    "",
    "-  await dbCall()",
    "+  try {",
    '+    await dbCall()',
    "+  } catch {}",
    "",
    "Prompt for AI Agent:",
    "In @src/example.ts around lines 10 - 14, wrap the call in try/catch.",
    "",
    "============================================================================",
    "File: src/other.ts",
    "Line: 20 to 21",
    "Type: potential_issue",
    "",
    "Comment:",
    "Inconsistent log prefix.",
    "",
    "This appears to be a copy-paste artifact and should use the helper name instead.",
    "",
    "Review completed: 2 findings ✔",
  ].join("\n");

  const findings = parseAuditFindings({
    toolId: "coderabbit",
    advisory,
  });

  assert.equal(findings.length, 2);
  assert.equal(findings[0].severity, "major");
  assert.equal(findings[0].summary, "Missing error handling contradicts the non-throwing contract.");
  assert.match(findings[0].raw_text, /awaited DB call can still reject/);
  assert.doesNotMatch(findings[0].raw_text, /Prompt for AI Agent|Proposed fix|await dbCall/);
  assert.equal(findings[1].summary, "Inconsistent log prefix.");
});

test("buildCodeRabbitReviewArgs scopes CodeRabbit to the same committed range", () => {
  assert.deepEqual(
    buildCodeRabbitReviewArgs({
      reviewTarget: {
        mode: "commit_range",
        diffBase: "abc123^",
      },
    }),
    ["review", "--plain", "--type", "committed", "--base-commit", "abc123^"],
  );
});

test("buildCodeRabbitReviewArgs skips committed range flags for root-commit diffs", () => {
  assert.deepEqual(
    buildCodeRabbitReviewArgs({
      reviewTarget: {
        mode: "commit_range",
        diffBase: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
      },
    }),
    ["review", "--plain"],
  );
});

test("parseAuditFindings recognizes markdown-wrapped severity labels", () => {
  const findings = parseAuditFindings({
    toolId: "coderabbit",
    advisory: [
      "============================================================================",
      "File: src/example.ts",
      "**Severity**: Critical issue",
      "",
      "Comment:",
      "Guard the null access.",
    ].join("\n"),
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "critical");
});

test("createSession persists audit run findings with severity in session.json shape", () => {
  const findings = parseAuditFindings({
    toolId: "coderabbit",
    advisory: [
      "============================================================================",
      "File: src/example.ts",
      "Severity: major",
      "",
      "Comment:",
      "Handle promise rejection.",
    ].join("\n"),
  });

  const session = createSession({
    sessionId: "s-123",
    reviewTarget: {
      mode: "commit_range",
      selector: "HEAD~1",
      diffBase: "abc123",
      commitShas: ["def456"],
      commitMessages: ["test commit"],
    },
    docsFiles: [],
    docsBytes: 0,
    redactionCount: 0,
    auditRuns: [
      {
        id: "coderabbit",
        status: "ok",
        advisory: "plain text advisory",
        findings,
      },
    ],
  });

  assert.equal(session.audit_runs[0].findings.length, 1);
  assert.equal(session.audit_runs[0].findings[0].severity, "major");
  assert.equal(session.audit_runs[0].findings[0].summary, "Handle promise rejection.");
});

test("parsePersistedCodeRabbitReviewFiles captures native CodeRabbit indicator types", () => {
  const findings = parsePersistedCodeRabbitReviewFiles({
    toolId: "coderabbit",
    reviewFiles: [
      {
        fileName: "src/example.ts",
        title: "Potential null reference on `value`.",
        comment:
          "**Potential null reference on `value`.**\n\nHandle the nullable input before dereferencing it.",
        indicatorTypes: ["potential_issue"],
        type: "actionable",
        timestamp: 2,
      },
      {
        fileName: "src/helper.ts",
        title: "Avoid redundant helper call.",
        comment: "**Avoid redundant helper call.**\n\nCache the computed result locally.",
        indicatorTypes: ["refactor_suggestion"],
        type: "actionable",
        timestamp: 3,
      },
    ],
  });

  assert.equal(findings.length, 2);
  assert.equal(findings[0].indicator_type, "potential_issue");
  assert.equal(findings[0].finding_type, "actionable");
  assert.equal(findings[0].severity, null);
  assert.equal(findings[0].summary, "Potential null reference on value.");
  assert.match(findings[0].raw_text, /Handle the nullable input/);
  assert.equal(findings[1].indicator_type, "refactor_suggestion");
});
