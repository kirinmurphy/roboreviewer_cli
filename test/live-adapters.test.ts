import test from "node:test";
import assert from "node:assert/strict";
import { createAdapter } from "../src/lib/adapters/index.ts";
import { createFixtureRepo, createLiveReviewRequest } from "../src/lib/fixtures.ts";

async function runReviewSmoke(toolId) {
  const cwd = await createFixtureRepo("roboreviewer-live-");
  const adapter = createAdapter(toolId);
  await adapter.healthcheck();
  await adapter.probeCapabilities();

  const result = await adapter.execute({
    ...createLiveReviewRequest(),
    cwd,
  });

  if (!("findings" in result) || !("comments" in result)) {
    throw new Error("Live review request returned a non-review response shape.");
  }

  assert.equal(result.status, "ok");
  assert.ok(Array.isArray(result.findings));
  assert.ok(Array.isArray(result.comments));
}

test(
  "codex live adapter smoke test",
  {
    skip: !process.env.ROBOREVIEWER_TEST_CODEX,
    timeout: 180000,
  },
  async () => {
    await runReviewSmoke("codex");
  },
);

test(
  "claude-code live adapter smoke test",
  {
    skip: !process.env.ROBOREVIEWER_TEST_CLAUDE,
    timeout: 180000,
  },
  async () => {
    await runReviewSmoke("claude-code");
  },
);
