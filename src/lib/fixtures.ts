import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { AGENT_TOOLS, AUDIT_TOOLS, REQUEST_TYPES, REVIEWER_IDS } from "./constants.ts";

const execFileAsync = promisify(execFile);

export async function git({ cwd, args }: { cwd: string; args: string[] }) {
  await execFileAsync("git", args, { cwd });
}

export async function createFixtureRepo(prefix: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await git({ cwd: tempDir, args: ["init"] });
  await git({ cwd: tempDir, args: ["config", "user.email", "test@example.com"] });
  await git({ cwd: tempDir, args: ["config", "user.name", "Test User"] });
  await fs.writeFile(path.join(tempDir, "app.js"), "export function run() {\n  return 1;\n}\n", "utf8");
  await git({ cwd: tempDir, args: ["add", "."] });
  await git({ cwd: tempDir, args: ["commit", "-m", "initial"] });
  return tempDir;
}

export async function createMockWorkflowRepo({ autoUpdate = true }: { autoUpdate?: boolean } = {}) {
  const tempDir = await createFixtureRepo("roboreviewer-test-");
  await fs.writeFile(
    path.join(tempDir, "app.js"),
    "export function run() {\n  debugger;\n  console.log('debug');\n  return 1;\n}\n",
    "utf8",
  );
  await git({ cwd: tempDir, args: ["add", "app.js"] });
  await git({ cwd: tempDir, args: ["commit", "-m", "introduce review targets"] });

  await fs.mkdir(path.join(tempDir, ".roboreviewer"), { recursive: true });
  await fs.writeFile(
    path.join(tempDir, ".roboreviewer", "config.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        autoUpdate,
        agents: {
          director: { tool: AGENT_TOOLS.MOCK },
          reviewers: [{ tool: AGENT_TOOLS.MOCK }],
        },
        audit_tools: [{ id: AUDIT_TOOLS.CODERABBIT, enabled: false }],
        context: { docs_path: "", max_docs_bytes: 200000 },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await git({ cwd: tempDir, args: ["add", ".roboreviewer/config.json"] });
  await git({ cwd: tempDir, args: ["commit", "-m", "add config"] });

  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD~1"], { cwd: tempDir });
  return {
    tempDir,
    reviewStart: stdout.trim(),
  };
}

export async function runCommandWithInput({
  command,
  args,
  cwd,
  input,
  closeDelayMs = 5000,
}: {
  command: string;
  args: string[];
  cwd: string;
  input: string;
  closeDelayMs?: number;
}) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `${command} exited with code ${code}`));
    });

    child.stdin.write(input);
    setTimeout(() => {
      child.stdin.end();
    }, closeDelayMs);
  });
}

export function createLiveReviewRequest() {
  return {
    type: REQUEST_TYPES.REVIEW,
    reviewerId: REVIEWER_IDS.PRIMARY,
    docsText: "",
    auditText: "",
    commitMessages: [{ sha: "fixture", subject: "fixture change" }],
    diffText: [
      "diff --git a/app.js b/app.js",
      "index 1111111..2222222 100644",
      "--- a/app.js",
      "+++ b/app.js",
      "@@ -1,3 +1,4 @@",
      " export function run() {",
      "+  debugger;",
      "   return 1;",
      " }",
      "",
    ].join("\n"),
  };
}
