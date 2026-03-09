import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const lintRoots = ["bin", "scripts", "src", "test"];

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

async function lintTypeScriptSyntax(filePath: string): Promise<void> {
  await execFileAsync(process.execPath, ["--experimental-strip-types", "--check", filePath], {
    cwd: rootDir,
  });
}

async function lintTextFormatting(filePath: string): Promise<string[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const issues: string[] = [];

  if (!raw.endsWith("\n")) {
    issues.push("must end with a trailing newline");
  }

  raw.split("\n").forEach((line, index) => {
    if (/\s+$/.test(line)) {
      issues.push(`line ${index + 1} has trailing whitespace`);
    }
    if (/\t/.test(line)) {
      issues.push(`line ${index + 1} contains a tab character`);
    }
  });

  return issues;
}

async function main(): Promise<void> {
  const files: string[] = [];
  for (const relativeRoot of lintRoots) {
    const absoluteRoot = path.join(rootDir, relativeRoot);
    try {
      await fs.access(absoluteRoot);
      files.push(...(await collectTypeScriptFiles(absoluteRoot)));
    } catch {
      // Ignore missing roots.
    }
  }

  const failures: string[] = [];

  for (const filePath of files) {
    try {
      await lintTypeScriptSyntax(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${path.relative(rootDir, filePath)} failed syntax check: ${message}`);
      continue;
    }

    const issues = await lintTextFormatting(filePath);
    for (const issue of issues) {
      failures.push(`${path.relative(rootDir, filePath)} ${issue}`);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`${failures.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Lint passed for ${files.length} TypeScript files.\n`);
}

await main();
