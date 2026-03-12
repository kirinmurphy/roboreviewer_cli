import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createMockWorkflowRepo } from "../src/lib/fixtures.ts";
import { buildUnifiedDiff, resolveReviewTarget } from "../src/lib/system/git.ts";

const execFileAsync = promisify(execFile);

test("resolveReviewTarget supports starting from the root commit", async () => {
  const { tempDir } = await createMockWorkflowRepo();
  const rootCommit = (
    await execFileAsync("git", ["rev-list", "--max-parents=0", "HEAD"], { cwd: tempDir })
  ).stdout.trim();

  const reviewTarget = await resolveReviewTarget({
    cwd: tempDir,
    selector: rootCommit,
    useLast: false,
  });
  const diffText = await buildUnifiedDiff({ cwd: tempDir, reviewTarget });

  assert.equal(reviewTarget.diffBase, "4b825dc642cb6eb9a060e54bf8d69288fbee4904");
  assert.equal(reviewTarget.commitShas.length, 3);
  assert.equal(reviewTarget.commitShas[0], rootCommit);
  assert.equal(reviewTarget.commitMessages[0]?.sha, rootCommit);
  assert.match(diffText, /diff --git a\/app\.js b\/app\.js/);
  assert.match(diffText, /diff --git a\/\.roboreviewer\/config\.json b\/\.roboreviewer\/config\.json/);
});
