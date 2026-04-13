import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/lib/config.ts";
import { createMockWorkflowRepo } from "../src/lib/fixtures.ts";
import { createSessionId } from "../src/lib/ids.ts";
import { createSession } from "../src/lib/runtime/session.ts";
import { runReviewWorkflow } from "../src/lib/runtime/workflow/index.ts";
import { buildUnifiedDiff, buildWorkspaceUnifiedDiff, resolveReviewTarget } from "../src/lib/system/git.ts";

test("repeat scan appends iterations and ignores previously tracked findings", async () => {
  const { tempDir, reviewStart } = await createMockWorkflowRepo({ autoUpdate: false });
  const config = await loadConfig(tempDir);
  const reviewTarget = await resolveReviewTarget({
    cwd: tempDir,
    selector: reviewStart,
    useLast: false,
  });
  const initialDiff = await buildUnifiedDiff({ cwd: tempDir, reviewTarget });
  const session = createSession({
    sessionId: createSessionId(),
    reviewTarget,
    docsFiles: [],
    docsBytes: 0,
    redactionCount: 0,
    auditRuns: [],
  });

  const firstSession = await runReviewWorkflow({
    cwd: tempDir,
    config,
    session,
    diffText: initialDiff,
    docsText: "",
    auditRuns: [],
    commitMessages: reviewTarget.commitMessages,
    scanIteration: 1,
    includeWorktree: false,
    docsPath: config.context.docs_path,
    diffBase: reviewTarget.diffBase,
    onApproveImplementationReady: async ({ findings }) =>
      new Map(findings.filter((finding) => finding.summary.includes("debugger")).map((finding) => [finding.finding_id, false])),
    onResolveConflicts: async ({ conflicts }) => {
      for (const conflict of conflicts) {
        conflict.human_decision = "discard_disputed_recommendation";
        conflict.status = "resolved";
      }
    },
  });

  const repeatDiff = await buildWorkspaceUnifiedDiff({
    cwd: tempDir,
    diffBase: reviewTarget.diffBase,
  });
  const secondSession = await runReviewWorkflow({
    cwd: tempDir,
    config,
    session: firstSession,
    diffText: repeatDiff,
    docsText: "",
    auditRuns: [],
    commitMessages: reviewTarget.commitMessages,
    scanIteration: 2,
    includeWorktree: true,
    docsPath: config.context.docs_path,
    diffBase: reviewTarget.diffBase,
    onApproveImplementationReady: async () => new Map(),
    onResolveConflicts: async ({ conflicts }) => {
      for (const conflict of conflicts) {
        conflict.human_decision = "discard_disputed_recommendation";
        conflict.status = "resolved";
      }
    },
  });

  assert.equal(secondSession.iterations.length, 2);
  assert.equal(secondSession.findings.length, 2);
  assert.equal(secondSession.reviewer_runs.length, 4);
  assert.equal(secondSession.reviewer_runs[0].scan_iteration, 1);
  assert.equal(secondSession.reviewer_runs[0].reviewer_tool, "mock");
  assert.match(secondSession.reviewer_runs[0].raw, /"findings":\[/);
  assert.deepEqual(
    secondSession.findings.map((finding) => finding.finding_id),
    ["f-1001-mock", "f-1002-mock"],
  );
  assert.equal(secondSession.findings.find((finding) => finding.finding_id === "f-1001-mock")?.user_approved, false);
  assert.equal(secondSession.findings.find((finding) => finding.finding_id === "f-1001-mock")?.status, "resolved");
  assert.equal(secondSession.iterations[1].new_findings_count, 0);
});
