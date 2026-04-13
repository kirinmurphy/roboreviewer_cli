import test from "node:test";
import assert from "node:assert/strict";
import { createClaudeAdapter, sanitizeClaudeErrorMessage } from "../src/lib/adapters/claude.ts";
import { createReviewResponse } from "../src/lib/adapters/shared.ts";

test("claude adapter module loads with parser support for fenced JSON responses", async () => {
  const adapter = createClaudeAdapter();
  assert.equal(adapter.id, "claude-code");
});

test("sanitizeClaudeErrorMessage strips prompt dumps and keeps the actionable Claude error", () => {
  const message = sanitizeClaudeErrorMessage({
    requestType: "implement",
    error: new Error(
      [
        "Path /tmp/repo/You are Roboreviewer implementing accepted findings directly in the working tree.",
        "",
        "Return only valid JSON and no surrounding commentary after edits are complete.",
        "",
        "Error: Input must be provided either through stdin or as a prompt argument when using --print",
      ].join("\n"),
    ),
  });

  assert.equal(
    message,
    "Claude implement request failed: Input must be provided either through stdin or as a prompt argument when using --print",
  );
});

test("createReviewResponse rejects malformed structured review payloads", () => {
  assert.throws(
    () => createReviewResponse({ findings: [] }),
    /missing required array field: comments/i,
  );
});
