import path from "node:path";
import { runCommand } from "./shell.ts";

export async function ensureGitRepository(cwd) {
  await runCommand({ command: "git", args: ["rev-parse", "--is-inside-work-tree"], cwd });
}

export async function ensureCleanWorkingTree(cwd) {
  const tracked = await runCommand({ command: "git", args: ["status", "--porcelain"], cwd });
  if (tracked.stdout.trim()) {
    throw new Error("Working tree must be clean before `roboreviewer review` starts.");
  }
}

export async function ensureAttachedHead(cwd) {
  const result = await runCommand({ command: "git", args: ["symbolic-ref", "--quiet", "HEAD"], cwd });
  if (!result.stdout.trim()) {
    throw new Error("Detached HEAD is not supported.");
  }
}

export async function resolveReviewTarget({ cwd, selector, useLast }) {
  if (useLast) {
    const head = (await runCommand({ command: "git", args: ["rev-parse", "HEAD"], cwd })).stdout.trim();
    const title = (await runCommand({ command: "git", args: ["log", "-1", "--pretty=%s", head], cwd })).stdout.trim();
    return {
      mode: "commit_range",
      selector: head,
      commitRangeStart: head,
      commitShas: [head],
      commitMessages: [{ sha: head, subject: title }],
      diffBase: `${head}^`,
    };
  }

  await runCommand({ command: "git", args: ["rev-parse", "--verify", selector], cwd });
  await runCommand({ command: "git", args: ["merge-base", "--is-ancestor", selector, "HEAD"], cwd });
  const shas = (
    await runCommand({ command: "git", args: ["rev-list", "--reverse", `${selector}^..HEAD`], cwd })
  ).stdout
    .trim()
    .split("\n")
    .filter(Boolean);
  const log = await runCommand({
    command: "git",
    args: ["log", "--reverse", "--pretty=%H%x09%s", `${selector}^..HEAD`],
    cwd,
  });
  const commitMessages = log.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split("\t");
      return { sha, subject };
    });

  return {
    mode: "commit_range",
    selector,
    commitRangeStart: selector,
    commitShas: shas,
    commitMessages,
    diffBase: `${selector}^`,
  };
}

export async function buildUnifiedDiff({ cwd, reviewTarget }) {
  const result = await runCommand({
    command: "git",
    args: ["diff", "--find-renames", "--unified=3", reviewTarget.diffBase, "HEAD"],
    cwd,
  });
  return result.stdout;
}

export async function listChangedFiles({ cwd, diffBase = "HEAD" }) {
  const result = await runCommand({ command: "git", args: ["diff", "--name-only", diffBase], cwd });
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((filePath) => path.normalize(filePath));
}
