import { AUDIT_TOOLS, AGENT_TOOLS } from "./constants.ts";
import { INTERNAL_CONFIG } from "./internal-config.ts";
import { runCommand } from "./system/shell.ts";

export async function installTool({ cwd, tool }: { cwd: string; tool: ToolSetup }) {
  if (!tool.installCommand) {
    throw new Error(`No automatic install command is configured for ${tool.displayName}.`);
  }

  await runCommand({
    command: tool.installCommand.command,
    args: [...tool.installCommand.args],
    cwd,
  });
}

export async function inspectToolAvailability({ tool }: { tool: ToolSetup }) {
  if (!tool.command) {
    return {
      ...tool,
      installed: true,
    };
  }

  return {
    ...tool,
    installed: await isCommandAvailable({ command: tool.command }),
  };
}

export function getAgentToolSetup({ toolId }: { toolId: string }): ToolSetup {
  if (toolId === AGENT_TOOLS.CODEX) {
    return INTERNAL_CONFIG.tools.agents.codex;
  }

  if (toolId === AGENT_TOOLS.CLAUDE_CODE) {
    return INTERNAL_CONFIG.tools.agents["claude-code"];
  }

  if (toolId === AGENT_TOOLS.MOCK) {
    return INTERNAL_CONFIG.tools.agents.mock;
  }

  throw new Error(`Unsupported agent tool: ${toolId}`);
}

export function getAuditToolSetup({ toolId }: { toolId: string }): ToolSetup {
  if (toolId === AUDIT_TOOLS.CODERABBIT) {
    return INTERNAL_CONFIG.tools.audit.coderabbit;
  }

  throw new Error(`Unsupported audit tool: ${toolId}`);
}

async function isCommandAvailable({ command }: { command: string }) {
  try {
    await runCommand({
      command: "which",
      args: [command],
    });
    return true;
  } catch {
    return false;
  }
}

type ToolSetup = {
  displayName: string;
  command: string;
  verifyCommand: string;
  launchCommand: string;
  requiresAuthentication: boolean;
  authReminder: string;
  installCommand: {
    command: string;
    args: readonly string[];
  } | null;
};
