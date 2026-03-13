import test from "node:test";
import assert from "node:assert/strict";
import { renderAuditResults } from "../src/lib/output/review-output/render-audit-sections.ts";
import { renderPeerReview, renderReviewerFindings } from "../src/lib/output/review-output/render-review-sections.ts";

test("renderReviewerFindings uses persisted finding ids without section indentation", () => {
  const output = renderReviewerFindings({
    reviewer: { tool: "codex" },
    verbose: true,
    findings: [
      {
        finding_id: "f-1001-codex",
        severity: "medium",
        category: "correctness",
        location: { file: "src/lib/ids.ts", line: 5 },
        source_reviewer_tool: "codex",
        summary: "IDs collide after enough findings.",
        recommendation: "Use a collision-proof encoding.",
      },
    ],
  });

  assert.match(output, /\nCount: 1\n/);
  assert.match(output, /\nf-1001-codex \[medium\/correctness\]\n/);
  assert.doesNotMatch(output, /\nSource: codex\n/);
  assert.doesNotMatch(output, /\n  Count: 1\n/);
  assert.doesNotMatch(output, /\n  f-1001-codex \[medium\/correctness\]\n/);
});

test("renderReviewerFindings omits empty recommendation blocks in verbose mode", () => {
  const output = renderReviewerFindings({
    reviewer: { tool: "codex" },
    verbose: true,
    findings: [
      {
        finding_id: "f-1003-codex",
        severity: "medium",
        category: "correctness",
        location: { file: "src/lib/output/review-output/format-finding.ts", line: 22 },
        source_reviewer_tool: "codex",
        summary: "Verbose output should not crash on missing recommendation text.",
        recommendation: null,
      },
    ],
  });

  assert.match(output, /\nf-1003-codex \[medium\/correctness\]\n/);
  assert.doesNotMatch(output, /\nRecommendation:\n/);
});

test("renderAuditResults shows green-style audit ids in the shared public format", () => {
  const output = renderAuditResults({
    auditRuns: [
      {
        id: "coderabbit",
        status: "ok",
        findings: [
          {
            audit_finding_id: "coderabbit-a-001",
            tool_id: "coderabbit",
            file: "src/example.ts",
            severity: "major",
            summary: "Handle errors consistently.",
            raw_text: "Handle errors consistently.",
            status: "not_adopted",
            adopted_by: [],
          },
        ],
      },
    ],
  });

  assert.match(output, /\nf-001-coderabbit \[major\]\n/);
  assert.doesNotMatch(output, /\n  f-001-coderabbit \[major\]\n/);
});

test("renderAuditResults falls back to native CodeRabbit indicator types when severity is unavailable", () => {
  const output = renderAuditResults({
    auditRuns: [
      {
        id: "coderabbit",
        status: "ok",
        findings: [
          {
            audit_finding_id: "coderabbit-a-001",
            tool_id: "coderabbit",
            file: "src/example.ts",
            severity: null,
            indicator_type: "potential_issue",
            summary: "Handle null access safely.",
            raw_text: "Handle null access safely.",
            status: "not_adopted",
            adopted_by: [],
          },
        ],
      },
    ],
  });

  assert.match(output, /\nf-001-coderabbit \[potential_issue\]\n/);
});

test("renderPeerReview falls back to target findings to label the reviewed source", () => {
  const output = renderPeerReview({
    reviewer: { tool: "codex" },
    comments: [],
    findings: [
      {
        finding_id: "f-1005-claude-code",
        source_reviewer_tool: "claude-code",
        summary: "Guard against null dereference.",
      },
    ],
    verbose: false,
  });

  assert.match(output, /Peer Review: codex reviewing claude-code's findings/);
  assert.match(output, /\nAgree: 0\n/);
  assert.match(output, /\nPushback: 0\n/);
});
