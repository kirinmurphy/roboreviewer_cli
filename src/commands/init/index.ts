import path from "node:path";
import { createDefaultConfig, saveConfig } from "../../lib/config.ts";
import {
  AGENT_TOOLS,
  AUDIT_TOOLS,
  CONFIG_DIR,
  CONFIG_PATH,
  REVIEW_IMPLEMENTATION_MODES,
  REVIEW_IMPLEMENTATION_MODE_LABELS,
} from "../../lib/constants.ts";
import { ensureDir, pathExists } from "../../lib/system/fs.ts";
import { withPrompter } from "../../lib/system/interactive.ts";
import {
  renderInitBanner,
  renderInitConfirmation,
  renderInitSection,
  renderInitWarning,
} from "../../lib/output/init-output.ts";
import { INTERNAL_CONFIG } from "../../lib/internal-config.ts";
import {
  promptForDocsPath,
  remindAboutAuditAuthentication,
  remindAboutAuthentication,
  updateGitignore,
} from "./helper-functions.ts";
import { addQuestionSpacing } from "./addQuestionSpacing.ts";
import {
  chooseAgentTool,
  chooseDefaultDirector,
  confirmAuditToolSelection,
  dedupeTools,
} from "./tool-selection.ts";

export async function runInitCommand() {
  const cwd = process.cwd();
  await ensureDir(path.join(cwd, CONFIG_DIR));
  const configPath = path.join(cwd, CONFIG_PATH);
  process.stdout.write(renderInitBanner());

  await withPrompter(async (prompt) => {
    const spacedPrompt = addQuestionSpacing({ prompt });

    if (
      (await pathExists(configPath)) &&
      !(await spacedPrompt.confirm(
        "Existing Roboreviewer config found. Overwrite it?",
        false,
      ))
    ) {
      process.stdout.write(
        renderInitWarning({
          message:
            "Initialization canceled. Existing configuration was left unchanged.",
        }),
      );
      return;
    }

    const installedTools = [];
    process.stdout.write(
      renderInitSection({
        title: INTERNAL_CONFIG.cli.init.repositorySectionTitle,
      }),
    );
    const docsPath = await promptForDocsPath({
      cwd,
      prompt: spacedPrompt,
      pathExists,
    });
    const maxDocsBytesRaw = await spacedPrompt.ask("Max docs bytes", "200000");

    process.stdout.write(
      renderInitSection({ title: INTERNAL_CONFIG.cli.init.agentsSectionTitle }),
    );
    const toolOptions = [
      AGENT_TOOLS.CODEX,
      AGENT_TOOLS.CLAUDE_CODE,
      AGENT_TOOLS.MOCK,
    ];
    const directorTool = await chooseAgentTool({
      cwd,
      installedTools,
      prompt: spacedPrompt,
      message: "Pick the main tool (Director) for reviews and updates",
      toolIds: toolOptions,
      defaultToolId: chooseDefaultDirector(),
    });
    const addReviewer = await spacedPrompt.confirm(
      "Add a second reviewer?",
      false,
    );
    const reviewerOptions = toolOptions.filter(
      (tool) => tool !== directorTool || tool === AGENT_TOOLS.MOCK,
    );
    const reviewerTool = addReviewer
      ? await chooseAgentTool({
          cwd,
          installedTools,
          prompt: spacedPrompt,
          message: "Second reviewer tool",
          toolIds: reviewerOptions,
          defaultToolId: reviewerOptions[0],
        })
      : null;

    process.stdout.write(
      renderInitSection({ title: INTERNAL_CONFIG.cli.init.auditSectionTitle }),
    );
    let enableCodeRabbit = await spacedPrompt.confirm(
      "Enable CodeRabbit audit tool?",
      false,
    );
    if (enableCodeRabbit) {
      enableCodeRabbit = await confirmAuditToolSelection({
        cwd,
        installedTools,
        prompt: spacedPrompt,
        toolId: AUDIT_TOOLS.CODERABBIT,
      });
    }

    const config = createDefaultConfig({
      docsPath,
      directorTool,
      reviewerTool,
      coderabbitEnabled: enableCodeRabbit,
    });
    const implementationModeOptions = [
      {
        mode: REVIEW_IMPLEMENTATION_MODES.AUTO_APPROVE_CONSENSUS,
        label: REVIEW_IMPLEMENTATION_MODE_LABELS.AUTO_APPROVE_CONSENSUS,
      },
      {
        mode: REVIEW_IMPLEMENTATION_MODES.MANUAL_APPROVE_EACH,
        label: REVIEW_IMPLEMENTATION_MODE_LABELS.MANUAL_APPROVE_EACH,
      },
    ];
    const implementationModeLabel = await spacedPrompt.choose(
      "How would you like to implement review recommendations:",
      implementationModeOptions.map((option) => option.label),
      0,
    );
    const implementationMode = implementationModeOptions.find(
      (option) => option.label === implementationModeLabel,
    )?.mode;
    config.autoUpdate =
      implementationMode === REVIEW_IMPLEMENTATION_MODES.AUTO_APPROVE_CONSENSUS;
    config.context.max_docs_bytes = Number(maxDocsBytesRaw);
    await saveConfig({ cwd, config });

    await updateGitignore(cwd, pathExists);

    process.stdout.write(
      renderInitSection({ title: INTERNAL_CONFIG.cli.init.authSectionTitle }),
    );
    await remindAboutAuthentication({
      prompt: spacedPrompt,
      toolIds: [directorTool, reviewerTool].filter(Boolean),
    });

    if (enableCodeRabbit) {
      await remindAboutAuditAuthentication({
        prompt: spacedPrompt,
        toolId: AUDIT_TOOLS.CODERABBIT,
      });
    }

    process.stdout.write(
      renderInitConfirmation({
        installedTools: dedupeTools({ tools: installedTools }),
      }),
    );
  });
}
