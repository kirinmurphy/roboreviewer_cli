import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createFixtureRepo, git } from "../src/lib/fixtures.ts";
import { findingId } from "../src/lib/ids.ts";
import { collectReviewerFindings } from "../src/lib/runtime/workflow/collectReviewerFindings.ts";
import { runPeerReview } from "../src/lib/runtime/workflow/runPeerReview.ts";
import { resolveReviewTarget } from "../src/lib/system/git.ts";

const execFileAsync = promisify(execFile);

test("findingId rejects values outside the supported persisted range", () => {
  assert.throws(() => findingId({ scanIteration: 1, index: 1000, reviewerTool: "codex" }), /index must be an integer between 1 and 999/);
  assert.throws(() => findingId({ scanIteration: 1000, index: 1, reviewerTool: "codex" }), /scanIteration must be an integer between 1 and 999/);
});

test("collectReviewerFindings tolerates missing summary and recommendation text", async () => {
  const progressEvents = [];
  const findings = await collectReviewerFindings({
    cwd: process.cwd(),
    reviewers: [
      {
        reviewer_id: "reviewer-1",
        tool: "claude-code",
        adapter: {
          execute: async () => ({
            findings: [
              {
                location: { file: "src/example.ts", line: 1 },
                summary: undefined,
                recommendation: null,
              },
            ],
            raw: "",
          }),
        },
      },
    ],
    diffText: "",
    docsText: "",
    auditRuns: [],
    commitMessages: [],
    existingFindings: [],
    scanIteration: 1,
    onProgress: (event) => {
      progressEvents.push(event);
    },
  });

  assert.equal(findings.findings.length, 1);
  assert.equal(findings.findings[0]?.finding_id, "f-1001-claude-code");
  assert.deepEqual(
    progressEvents.find((event) => event?.type === "reviewer_findings")?.findings.map((finding) => finding.finding_id),
    ["f-1001-claude-code"],
  );
});

test("collectReviewerFindings runs independent reviewer requests concurrently", async () => {
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const releaseResolvers: Array<() => void> = [];

  const createReviewer = ({ reviewerId, tool }: { reviewerId: string; tool: string }) => ({
    reviewer_id: reviewerId,
    tool,
    adapter: {
      execute: async () => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

        await new Promise<void>((resolve) => {
          releaseResolvers.push(resolve);
          if (releaseResolvers.length === 2) {
            for (const release of releaseResolvers.splice(0)) {
              release();
            }
          }
        });

        activeRequests -= 1;
        return {
          findings: [
            {
              location: { file: `src/${tool}.ts`, line: 1 },
              summary: `${tool} finding`,
              recommendation: "Apply the suggested fix.",
            },
          ],
          raw: "",
        };
      },
    },
  });

  const result = await collectReviewerFindings({
    cwd: process.cwd(),
    reviewers: [
      createReviewer({ reviewerId: "reviewer-1", tool: "claude-code" }),
      createReviewer({ reviewerId: "reviewer-2", tool: "codex" }),
    ],
    diffText: "",
    docsText: "",
    auditRuns: [],
    commitMessages: [],
    existingFindings: [],
    scanIteration: 1,
    onProgress: () => {},
  });

  assert.equal(maxActiveRequests, 2);
  assert.equal(result.findings.length, 2);
});

test("resolveReviewTarget preserves tabs in commit subjects", async () => {
  const tempDir = await createFixtureRepo("roboreviewer-tabs-");
  await fs.writeFile(path.join(tempDir, "app.js"), "export function run() {\n  return 2;\n}\n", "utf8");
  await git({ cwd: tempDir, args: ["add", "app.js"] });
  await git({ cwd: tempDir, args: ["commit", "-m", "subject\twith\ttabs"] });
  const selector = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir })).stdout.trim();

  const reviewTarget = await resolveReviewTarget({
    cwd: tempDir,
    selector,
    useLast: false,
  });

  assert.equal(reviewTarget.commitMessages[0]?.subject, "subject\twith\ttabs");
});

test("runPeerReview rejects incomplete peer review coverage", async () => {
  await assert.rejects(
    runPeerReview({
      cwd: process.cwd(),
      reviewers: [
        {
          reviewer_id: "reviewer-1",
          tool: "codex",
          adapter: {
            execute: async () => ({ comments: [] }),
          },
        },
        {
          reviewer_id: "reviewer-2",
          tool: "claude-code",
          adapter: {
            execute: async ({ reviewerId, findings }) => ({
              comments: findings.map((finding) => ({
                finding_id: finding.finding_id,
                stance: "agree",
                note: `${reviewerId} reviewed ${finding.finding_id}`,
              })),
            }),
          },
        },
      ],
      findings: [
        {
          finding_id: "f-1001-codex",
          source_reviewer_id: "reviewer-1",
          source_reviewer_tool: "codex",
          peer_reviews: [],
        },
        {
          finding_id: "f-1002-claude-code",
          source_reviewer_id: "reviewer-2",
          source_reviewer_tool: "claude-code",
          peer_reviews: [],
        },
      ],
      diffText: "",
      onProgress: () => {},
    }),
    /codex returned 0 peer review comment\(s\) for 1 finding\(s\)\./,
  );
});
