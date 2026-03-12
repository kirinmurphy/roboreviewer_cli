import path from "node:path";
import { runCommand } from "./shell.ts";

export const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

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
    const diffBase = await resolveDiffBase({ cwd, selector: head });
    return {
      mode: "commit_range",
      selector: head,
      commitRangeStart: head,
      commitShas: [head],
      commitMessages: [{ sha: head, subject: title }],
      diffBase,
    };
  }

  await runCommand({ command: "git", args: ["rev-parse", "--verify", selector], cwd });
  await runCommand({ command: "git", args: ["merge-base", "--is-ancestor", selector, "HEAD"], cwd });
  const diffBase = await resolveDiffBase({ cwd, selector });
  const commitMessages = await resolveCommitMessages({ cwd, selector, diffBase });
  const shas = commitMessages.map(({ sha }) => sha);

  return {
    mode: "commit_range",
    selector,
    commitRangeStart: selector,
    commitShas: shas,
    commitMessages,
    diffBase,
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
  return normalizeFileList(result.stdout);
}

export async function buildWorkspaceUnifiedDiff({ cwd, diffBase }) {
  const trackedResult = await runCommand({
    command: "git",
    args: ["diff", "--find-renames", "--unified=3", diffBase],
    cwd,
  });
  const untrackedFiles = await listUntrackedFiles({ cwd });
  const untrackedDiffs = [];

  for (const filePath of untrackedFiles) {
    const result = await runCommand({
      command: "git",
      args: ["diff", "--no-index", "--find-renames", "--unified=3", "--", "/dev/null", filePath],
      cwd,
      allowedExitCodes: [1],
    });
    untrackedDiffs.push(result.stdout);
  }

  return [trackedResult.stdout, ...untrackedDiffs].filter(Boolean).join("\n");
}

export async function listReviewScopeFiles({ cwd, diffBase, includeWorktree }) {
  const trackedResult = await runCommand({
    command: "git",
    args: ["diff", "--name-only", includeWorktree ? diffBase : `${diffBase}..HEAD`],
    cwd,
  });
  const trackedFiles = normalizeFileList(trackedResult.stdout);
  if (!includeWorktree) {
    return trackedFiles;
  }

  const untrackedFiles = await listUntrackedFiles({ cwd });
  return [...new Set([...trackedFiles, ...untrackedFiles])];
}

async function listUntrackedFiles({ cwd }: { cwd: string }) {
  const result = await runCommand({
    command: "git",
    args: ["ls-files", "--others", "--exclude-standard"],
    cwd,
  });
  return normalizeFileList(result.stdout);
}

function normalizeFileList(stdout: string) {
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((filePath) => path.normalize(filePath));
}

async function resolveDiffBase({ cwd, selector }: { cwd: string; selector: string }) {
  const hasParent = await commitHasParent({ cwd, selector });
  return hasParent ? `${selector}^` : EMPTY_TREE_SHA;
}

async function resolveCommitMessages({
  cwd,
  selector,
  diffBase,
}: {
  cwd: string;
  selector: string;
  diffBase: string;
}) {
  const logArgs =
    diffBase === EMPTY_TREE_SHA
      ? ["log", "--reverse", "--pretty=%H%x09%s", "--ancestry-path", `${selector}..HEAD`]
      : ["log", "--reverse", "--pretty=%H%x09%s", `${selector}^..HEAD`];
  const log = await runCommand({
    command: "git",
    args: logArgs,
    cwd,
  });
  const trailingMessages = parseCommitMessages(log.stdout);
  if (diffBase !== EMPTY_TREE_SHA) {
    return trailingMessages;
  }

  const selectorSubject = (await runCommand({
    command: "git",
    args: ["log", "-1", "--pretty=%s", selector],
    cwd,
  })).stdout.trim();
  return [{ sha: selector, subject: selectorSubject }, ...trailingMessages];
}

async function commitHasParent({ cwd, selector }: { cwd: string; selector: string }) {
  const parents = (
    await runCommand({
      command: "git",
      args: ["rev-list", "--parents", "-n", "1", selector],
      cwd,
    })
  ).stdout
    .trim()
    .split(" ")
    .filter(Boolean);
  return parents.length > 1;
}

function parseCommitMessages(stdout: string) {
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("\t");
      const sha = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
      const subject = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
      return { sha, subject };
    });
}
