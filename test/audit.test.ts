import test from "node:test";
import assert from "node:assert/strict";
import { buildCodeRabbitReviewArgs, parseAuditFindings } from "../src/lib/runtime/audit.ts";

test("parseAuditFindings keeps CodeRabbit comment blocks and drops patch/proposal fragments", () => {
  const advisory = [
    "Starting CodeRabbit review in plain text mode...",
    "",
    "============================================================================",
    "File: src/example.ts",
    "Line: 10 to 14",
    "Type: potential_issue",
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
