import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { createMockWorkflowRepo, runCommandWithInput } from "../src/lib/fixtures.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binPath = path.join(repoRoot, "bin", "roboreviewer.ts");

test("review completes the mock workflow", async () => {
  const { tempDir, reviewStart } = await createMockWorkflowRepo();

  await runCommandWithInput({
    command: "node",
    args: ["--experimental-strip-types", binPath, "review", reviewStart],
    cwd: tempDir,
    input: "1\n2\n",
    closeDelayMs: 30000,
  });
  const sessionAfterReview = JSON.parse(
    await fs.readFile(path.join(tempDir, ".roboreviewer", "runtime", "session.json"), "utf8"),
  );

  if (sessionAfterReview.status === "paused") {
    await runCommandWithInput({
      command: "node",
      args: ["--experimental-strip-types", binPath, "resume"],
      cwd: tempDir,
      input: "1\n",
      closeDelayMs: 30000,
    });
  }

  const finalSession = JSON.parse(await fs.readFile(path.join(tempDir, ".roboreviewer", "runtime", "session.json"), "utf8"));
  const appJs = await fs.readFile(path.join(tempDir, "app.js"), "utf8");
  const historySession = JSON.parse(
    await fs.readFile(
      path.join(tempDir, ".roboreviewer", "runtime", "history", finalSession.session_id, "session.json"),
      "utf8",
    ),
  );

  assert.equal(finalSession.status, "complete");
  assert.equal(historySession.session_id, finalSession.session_id);
  assert.equal(finalSession.conflicts[0].human_decision, "implement_disputed_recommendation");
  assert.match(appJs, /return 1;/);
  assert.doesNotMatch(appJs, /console\.log/);
});
