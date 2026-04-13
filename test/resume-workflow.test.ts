import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../src/lib/config.ts";
import { createMockWorkflowRepo } from "../src/lib/fixtures.ts";
import { createSessionId } from "../src/lib/ids.ts";
import { collectConsensusApprovalDecisions } from "../src/lib/runtime/manual-consensus.ts";
import { runResumeWorkflow } from "../src/lib/runtime/resume-workflow.ts";
import { createSession, ensureRuntime, loadSession, saveSession } from "../src/lib/runtime/session.ts";
import { runReviewWorkflow } from "../src/lib/runtime/workflow/index.ts";
import { buildUnifiedDiff, resolveReviewTarget } from "../src/lib/system/git.ts";

test("resume continues a paused manual consensus approval workflow", async () => {
  const { tempDir, reviewStart } = await createMockWorkflowRepo({ autoUpdate: false });
  const config = await loadConfig(tempDir);
  const reviewTarget = await resolveReviewTarget({
    cwd: tempDir,
    selector: reviewStart,
    useLast: false,
  });
  const diffText = await buildUnifiedDiff({ cwd: tempDir, reviewTarget });
  await ensureRuntime(tempDir);

  const session = createSession({
    sessionId: createSessionId(),
    reviewTarget,
    docsFiles: [],
    docsBytes: 0,
    redactionCount: 0,
    auditRuns: [],
  });
  await saveSession({ cwd: tempDir, session });

  await assert.rejects(
    runReviewWorkflow({
      cwd: tempDir,
      config,
      session,
      diffText,
      docsText: "",
      auditRuns: [],
      commitMessages: reviewTarget.commitMessages,
      scanIteration: 1,
      includeWorktree: false,
      docsPath: config.context.docs_path,
      diffBase: reviewTarget.diffBase,
      onApproveImplementationReady: async () => {
        await collectConsensusApprovalDecisions({
          cwd: tempDir,
          session,
          prompt: createConsensusPrompt([true]),
        });
        throw new Error("interrupted after first consensus approval");
      },
    }),
    /interrupted after first consensus approval/,
  );

  const pausedSession = await loadSession(tempDir);
  assert.equal(pausedSession.status, "paused");
  assert.equal(pausedSession.cursor.phase, "manual_consensus_approval");
  assert.equal(pausedSession.cursor.next_finding_index, 1);

  const resumedSession = await runResumeWorkflow({
    cwd: tempDir,
    config,
    session: pausedSession,
    prompt: createResumePrompt(),
  });

  const appJs = await fs.readFile(path.join(tempDir, "app.js"), "utf8");
  assert.equal(resumedSession.status, "complete");
  assert.equal(resumedSession.cursor, null);
  assert.equal(resumedSession.iterations.length, 1);
  assert.equal(resumedSession.findings.find((finding) => finding.summary.includes("debugger"))?.user_approved, true);
  assert.equal(
    resumedSession.conflicts.find((conflict) => conflict.finding_id === "f-1002-mock")?.human_decision,
    "implement_disputed_recommendation",
  );
  assert.doesNotMatch(appJs, /debugger/);
  assert.doesNotMatch(appJs, /console\.log/);
});

function createConsensusPrompt(approvals: boolean[]) {
  let approvalIndex = 0;
  return {
    async ask() {
      throw new Error("not implemented");
    },
    async confirm() {
      const nextApproval = approvals[approvalIndex];
      approvalIndex += 1;
      if (typeof nextApproval !== "boolean") {
        throw new Error("missing approval response");
      }
      return nextApproval;
    },
    async choose() {
      throw new Error("not implemented");
    },
    async close() {},
  };
}

function createResumePrompt() {
  return {
    async ask() {
      throw new Error("not implemented");
    },
    async confirm() {
      throw new Error("unexpected confirm prompt");
    },
    async choose() {
      return "Implement Disputed Recommendation";
    },
    async close() {},
  };
}
