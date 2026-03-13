import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createFixtureRepo } from "../src/lib/fixtures.ts";
import { loadDocumentationContext } from "../src/lib/docs.ts";
import { validateConfig } from "../src/lib/config.ts";

test("loadDocumentationContext accepts a single docs file", async () => {
  const tempDir = await createFixtureRepo("roboreviewer-docs-file-");
  const docsFile = path.join(tempDir, "guide.md");
  await fs.writeFile(docsFile, "# Guide\nUse this file.\n", "utf8");

  const context = await loadDocumentationContext({
    cwd: tempDir,
    docsPath: "guide.md",
    maxDocsBytes: 200000,
  });

  assert.equal(context.files.length, 1);
  assert.equal(context.files[0], "guide.md");
  assert.match(context.docsText, /<documentation path="guide\.md">/);
  assert.match(context.docsText, /# Guide/);
});

test("loadDocumentationContext still accepts a docs folder", async () => {
  const tempDir = await createFixtureRepo("roboreviewer-docs-dir-");
  await fs.mkdir(path.join(tempDir, "docs"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "docs", "a.md"), "# A\n", "utf8");
  await fs.writeFile(path.join(tempDir, "docs", "b.txt"), "B\n", "utf8");

  const context = await loadDocumentationContext({
    cwd: tempDir,
    docsPath: "docs",
    maxDocsBytes: 200000,
  });

  assert.deepEqual(context.files, ["docs/a.md", "docs/b.txt"]);
});

test("validateConfig accepts a single docs file path", () => {
  assert.doesNotThrow(() =>
    validateConfig({
      cwd: "/tmp/project",
      config: {
        schema_version: 1,
        autoUpdate: true,
        agents: {
          director: { tool: "mock" },
          reviewers: [],
        },
        audit_tools: [],
        context: {
          docs_path: "README.md",
          max_docs_bytes: 200000,
        },
      },
    }),
  );
});
