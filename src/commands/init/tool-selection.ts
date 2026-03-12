import { AGENT_TOOLS } from "../../lib/constants.ts";
import { renderInitError, renderInitStatus, renderInitWarning } from "../../lib/output/init-output.ts";
import { getAgentToolSetup, getAuditToolSetup, inspectToolAvailability, installTool } from "../../lib/tooling.ts";

export async function chooseAgentTool({
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

export async function confirmAuditToolSelection({
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

export function chooseDefaultDirector() {
  return AGENT_TOOLS.CODEX;
}

export function dedupeTools({ tools }) {
  const seen = new Set<string>();
  return tools.filter((tool) => {
    if (seen.has(tool.command)) {
      return false;
    }
    seen.add(tool.command);
    return true;
  });
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
