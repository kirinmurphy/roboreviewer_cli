import { AGENT_TOOLS } from "../constants.ts";
import { createClaudeAdapter } from "./claude.ts";
import { createCodexAdapter } from "./codex.ts";
import { createMockAdapter } from "./mock.ts";

export function createAdapter(toolId) {
  if (toolId === AGENT_TOOLS.CLAUDE_CODE) {
    return createClaudeAdapter();
  }

  if (toolId === AGENT_TOOLS.CODEX) {
    return createCodexAdapter();
  }

  if (toolId === AGENT_TOOLS.MOCK) {
    return createMockAdapter(toolId);
  }

  throw new Error(`Unsupported adapter tool: ${toolId}`);
}
