import path from "node:path";
import fs from "node:fs/promises";
import { renderInitWarning } from "../../lib/output/init-output.ts";
import { getAgentToolSetup, getAuditToolSetup, inspectToolAvailability } from "../../lib/tooling.ts";

export async function promptForDocsPath({ cwd, prompt, pathExists }) {
  const defaultDocsPath = (await pathExists(path.join(cwd, "docs"))) ? "docs" : "";
  const useDocs = await prompt.confirm(
    "Do you have a docs folder to provide global context for the reviewers?",
    Boolean(defaultDocsPath),
  );

  if (!useDocs) {
    return "";
  }

  while (true) {
    const docsPath = await prompt.ask(
      "Docs path",
      defaultDocsPath,
    );
    if (!docsPath) {
      process.stdout.write(renderInitWarning({ message: "Docs path cannot be blank while docs context is enabled." }));
      continue;
    }

    const fullDocsPath = path.isAbsolute(docsPath) ? docsPath : path.join(cwd, docsPath);
    if (await pathExists(fullDocsPath)) {
      return docsPath;
    }

    process.stdout.write(renderInitWarning({ message: `Docs path does not exist: ${docsPath}` }));
  }
}

export async function updateGitignore(cwd, pathExists) {
  const gitignorePath = path.join(cwd, ".gitignore");
  const entry = ".roboreviewer/";
  const existing = (await pathExists(gitignorePath))
    ? await fs.readFile(gitignorePath, "utf8")
    : "";
  if (!existing.split("\n").includes(entry)) {
    const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
    await fs.writeFile(gitignorePath, `${existing}${prefix}${entry}\n`, "utf8");
  }
}

export async function remindAboutAuthentication({
  prompt,
  toolIds,
}) {
  const seen = new Set<string>();

  for (const toolId of toolIds) {
    if (seen.has(toolId)) {
      continue;
    }
    seen.add(toolId);

    const tool = await inspectToolAvailability({
      tool: getAgentToolSetup({ toolId }),
    });
    if (!tool.installed || !tool.requiresAuthentication) {
      continue;
    }

    const alreadyAuthenticated = await prompt.confirm(
      `Have you already authenticated ${tool.displayName} on this machine?`,
      true,
    );
    if (!alreadyAuthenticated) {
      process.stdout.write(renderInitWarning({ message: tool.authReminder }));
    }
  }
}

export async function remindAboutAuditAuthentication({
  prompt,
  toolId,
}) {
  const tool = await inspectToolAvailability({
    tool: getAuditToolSetup({ toolId }),
  });
  if (!tool.installed || !tool.requiresAuthentication) {
    return;
  }

  const alreadyAuthenticated = await prompt.confirm(
    `Have you already authenticated ${tool.displayName} on this machine?`,
    true,
  );
  if (!alreadyAuthenticated) {
    process.stdout.write(renderInitWarning({ message: tool.authReminder }));
  }
}
