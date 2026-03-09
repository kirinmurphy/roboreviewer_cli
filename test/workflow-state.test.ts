import test from "node:test";
import assert from "node:assert/strict";
import { buildTrackedAuditFindings } from "../src/lib/runtime/workflow-state.ts";

test("buildTrackedAuditFindings uses reviewer rejection notes for non-adopted audit items", () => {
  const tracked = buildTrackedAuditFindings({
    auditFindings: [
      {
        audit_finding_id: "coderabbit-a-001",
        tool_id: "coderabbit",
        file: ".claude/settings.json",
        summary: "Potential bypass and missing dangerous git commands in deny list.",
        raw_text: "Potential bypass and missing dangerous git commands in deny list.",
      },
    ],
    findings: [],
    auditAssessments: [
      {
        audit_finding_id: "coderabbit-a-001",
        reviewer_id: "reviewer-1",
        reviewer_tool: "claude-code",
        disposition: "reject",
        note: "The deny list in .claude/settings.json is advisory only; actual command enforcement happens in the execution boundary, so this file alone does not create the bypass described.",
      },
      {
        audit_finding_id: "coderabbit-a-001",
        reviewer_id: "reviewer-2",
        reviewer_tool: "codex",
        disposition: "reject",
        note: "No concrete bypass path is shown in the reviewed change.",
      },
    ],
  });

  assert.equal(tracked[0].status, "not_adopted");
  assert.equal(
    tracked[0].not_adopted_reason,
    "The deny list in .claude/settings.json is advisory only; actual command enforcement happens in the execution boundary, so this file alone does not create the bypass described.",
  );
});
