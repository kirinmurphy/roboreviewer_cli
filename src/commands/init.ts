import path from "node:path";
import { createDefaultConfig, saveConfig } from "../lib/config.ts";
import { AGENT_TOOLS, AUDIT_TOOLS, CONFIG_DIR, CONFIG_PATH } from "../lib/constants.ts";
import { ensureDir, pathExists } from "../lib/system/fs.ts";
import { withPrompter } from "../lib/system/interactive.ts";
import { renderInitBanner, renderInitConfirmation, renderInitError, renderInitSection, renderInitStatus, renderInitWarning } from "../lib/output/init-output.ts";
import { INTERNAL_CONFIG } from "../lib/internal-config.ts";
import { getAgentToolSetup, getAuditToolSetup, inspectToolAvailability, installTool } from "../lib/tooling.ts";
import fs from "node:fs/promises";

export async function runInitCommand() {
  const cwd = process.cwd();
  await ensureDir(path.join(cwd, CONFIG_DIR));
  const configPath = path.join(cwd, CONFIG_PATH);
  process.stdout.write(renderInitBanner());

  await withPrompter(async (prompt) => {
    if ((await pathExists(configPath)) && !(await prompt.confirm("Existing Roboreviewer config found. Overwrite it?", false))) {
      process.stdout.write(renderInitWarning({ message: "Initialization canceled. Existing configuration was left unchanged." }));
      return;
    }

    const installedTools = [];
    process.stdout.write(renderInitSection({ title: INTERNAL_CONFIG.cli.init.repositorySectionTitle }));
    const docsPath = await promptForDocsPath({ cwd, prompt });
    const maxDocsBytesRaw = await prompt.ask("Max docs bytes", "200000");

    process.stdout.write(renderInitSection({ title: INTERNAL_CONFIG.cli.init.agentsSectionTitle }));
    const toolOptions = [AGENT_TOOLS.CODEX, AGENT_TOOLS.CLAUDE_CODE, AGENT_TOOLS.MOCK];
    const directorTool = await chooseAgentTool({
      cwd,
      installedTools,
      prompt,
      message: "Pick the main tool (Director) for reviews and updates",
      toolIds: toolOptions,
      defaultToolId: chooseDefaultDirector(Boolean(docsPath)),
    });
    const addReviewer = await prompt.confirm("Add a second reviewer?", false);
    const reviewerOptions = toolOptions.filter(
      (tool) => tool !== directorTool || tool === AGENT_TOOLS.MOCK,
    );
    const reviewerTool = addReviewer
      ? await chooseAgentTool({
          cwd,
          installedTools,
          prompt,
          message: "Second reviewer tool",
          toolIds: reviewerOptions,
          defaultToolId: reviewerOptions[0],
        })
      : null;

    process.stdout.write(renderInitSection({ title: INTERNAL_CONFIG.cli.init.auditSectionTitle }));
    let enableCodeRabbit = await prompt.confirm(
      "Enable CodeRabbit audit tool?",
      false,
    );
    if (enableCodeRabbit) {
      enableCodeRabbit = await confirmAuditToolSelection({
        cwd,
        installedTools,
        prompt,
        toolId: AUDIT_TOOLS.CODERABBIT,
      });
    }

    const config = createDefaultConfig({
      docsPath,
      directorTool,
      reviewerTool,
      coderabbitEnabled: enableCodeRabbit,
    });
    config.context.max_docs_bytes = Number(maxDocsBytesRaw);
    await saveConfig({ cwd, config });

    process.stdout.write(renderInitSection({ title: INTERNAL_CONFIG.cli.init.repositoryFilesSectionTitle }));
    if (
      await prompt.confirm("Add .roboreviewer/ to .gitignore?", true)
    ) {
      await updateGitignore(cwd);
    }

    process.stdout.write(renderInitSection({ title: INTERNAL_CONFIG.cli.init.authSectionTitle }));
    await remindAboutAuthentication({
      prompt,
      toolIds: [directorTool, reviewerTool].filter(Boolean),
    });

    if (enableCodeRabbit) {
      await remindAboutAuditAuthentication({
        prompt,
        toolId: AUDIT_TOOLS.CODERABBIT,
      });
    }

    process.stdout.write(renderInitConfirmation({ installedTools: dedupeTools({ tools: installedTools }) }));
  });
}

async function chooseAgentTool({
  cwd,
  installedTools,
  prompt,
  message,
  toolIds,
  defaultToolId,
}) {
  while (true) {
    const options = await buildToolOptions({ toolIds });
    const selectedLabel = await prompt.choose(
      message,
      options.map((option) => option.label),
      Math.max(
        0,
        options.findIndex((option) => option.toolId === defaultToolId),
      ),
    );
    const selected = options.find((option) => option.label === selectedLabel);
    if (!selected) {
      throw new Error("Selected tool option could not be resolved.");
    }

    if (
      await confirmToolSelection({
        cwd,
        installedTools,
        prompt,
        tool: selected.tool,
      })
    ) {
      return selected.toolId;
    }
  }
}

async function confirmAuditToolSelection({
  cwd,
  installedTools,
  prompt,
  toolId,
}) {
  const tool = await inspectToolAvailability({
    tool: getAuditToolSetup({ toolId }),
  });

  if (tool.installed) {
    return true;
  }

  process.stdout.write(renderInitWarning({ message: `${tool.displayName} is not installed.` }));
  if (tool.installCommand) {
    const installNow = await prompt.confirm(
      `Install ${tool.displayName} now?`,
      true,
    );
    if (installNow) {
      const outcome = await tryInstallTool({ cwd, tool });
      if (outcome.installed) {
        if (outcome.installedNow) {
          installedTools.push(tool);
        }
        return true;
      }
    }
  }

  process.stdout.write(
    renderInitWarning({
      message: `${tool.displayName} will remain disabled. Review runs will skip it until you install it and re-enable it.`,
    }),
  );
  return false;
}

async function buildToolOptions({ toolIds }) {
  const options = [];
  for (const toolId of toolIds) {
    const tool = await inspectToolAvailability({
      tool: getAgentToolSetup({ toolId }),
    });
    options.push({
      toolId,
      tool,
      label: `${toolId} (${tool.installed ? "installed" : "missing"})`,
    });
  }
  return options;
}

async function confirmToolSelection({
  cwd,
  installedTools,
  prompt,
  tool,
}) {
  if (tool.installed) {
    return true;
  }

  process.stdout.write(renderInitWarning({ message: `${tool.displayName} is not installed.` }));

  if (tool.installCommand) {
    const installNow = await prompt.confirm(
      `Install ${tool.displayName} now?`,
      true,
    );
    if (installNow) {
      const outcome = await tryInstallTool({ cwd, tool });
      if (outcome.installed) {
        if (outcome.installedNow) {
          installedTools.push(tool);
        }
        return true;
      }
    }
  }

  return prompt.confirm(
    `${tool.displayName} is still unavailable. Keep it selected anyway?`,
    false,
  );
}

async function tryInstallTool({ cwd, tool }) {
  process.stdout.write(renderInitStatus({ message: `Installing ${tool.displayName}` }));
  try {
    await installTool({ cwd, tool });
  } catch (error) {
    process.stdout.write(renderInitError({ message: `Install failed: ${error instanceof Error ? error.message : String(error)}` }));
    return { installed: false, installedNow: false };
  }

  const refreshed = await inspectToolAvailability({ tool });
  if (!refreshed.installed) {
    process.stdout.write(
      renderInitWarning({
        message: `${tool.displayName} install completed, but the command is still not available in PATH.`,
      }),
    );
    return { installed: false, installedNow: false };
  }

  process.stdout.write(renderInitStatus({ message: `${tool.displayName} is now available` }));
  return { installed: true, installedNow: true };
}

function dedupeTools({ tools }) {
  const seen = new Set<string>();
  return tools.filter((tool) => {
    if (seen.has(tool.command)) {
      return false;
    }
    seen.add(tool.command);
    return true;
  });
}

async function promptForDocsPath({ cwd, prompt }) {
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

async function updateGitignore(cwd) {
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

async function remindAboutAuthentication({
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

async function remindAboutAuditAuthentication({
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

function chooseDefaultDirector(hasDocs) {
  return AGENT_TOOLS.CODEX;
}
