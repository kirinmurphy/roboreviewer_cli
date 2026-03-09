import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { createMockWorkflowRepo, runCommandWithInput } from "../src/lib/fixtures.ts";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binPath = path.join(repoRoot, "bin", "roboreviewer.ts");

test("review and resolve complete the mock workflow", async () => {
  const { tempDir, reviewStart } = await createMockWorkflowRepo();

  await execFileAsync("node", ["--experimental-strip-types", binPath, "review", reviewStart], { cwd: tempDir });
  const sessionAfterReview = JSON.parse(
    await fs.readFile(path.join(tempDir, ".roboreviewer", "runtime", "session.json"), "utf8"),
  );

  assert.equal(sessionAfterReview.status, "paused");
  assert.equal(sessionAfterReview.conflicts.length, 1);

  await runCommandWithInput({
    command: "node",
    args: ["--experimental-strip-types", binPath, "resolve"],
    cwd: tempDir,
    input: "1\n",
  });

  const finalSession = JSON.parse(await fs.readFile(path.join(tempDir, ".roboreviewer", "runtime", "session.json"), "utf8"));
  const appJs = await fs.readFile(path.join(tempDir, "app.js"), "utf8");
  const summary = await fs.readFile(path.join(tempDir, ".roboreviewer", "runtime", "ROBOREVIEWER_SUMMARY.md"), "utf8");
  const historySession = JSON.parse(
    await fs.readFile(
      path.join(tempDir, ".roboreviewer", "runtime", "history", finalSession.session_id, "session.json"),
      "utf8",
    ),
  );
  const historySummary = await fs.readFile(
    path.join(tempDir, ".roboreviewer", "runtime", "history", finalSession.session_id, "ROBOREVIEWER_SUMMARY.md"),
    "utf8",
  );

  assert.equal(finalSession.status, "complete");
  assert.equal(historySession.session_id, finalSession.session_id);
  assert.equal(finalSession.conflicts[0].human_decision, "implement_disputed_recommendation");
  assert.match(appJs, /return 1;/);
  assert.doesNotMatch(appJs, /debugger/);
  assert.doesNotMatch(appJs, /console\.log/);
  assert.match(summary, /Resolved Disputes/);
  assert.match(historySummary, /Resolved Disputes/);
});
