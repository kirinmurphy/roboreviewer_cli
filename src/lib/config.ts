import path from "node:path";
import {
  AUDIT_TOOLS,
  CONFIG_PATH,
  DEFAULT_AUTO_UPDATE,
  DEFAULT_MAX_DOCS_BYTES,
  SCHEMA_VERSION,
  SUPPORTED_AGENT_TOOLS,
  SUPPORTED_AUDIT_TOOLS,
} from "./constants.ts";
import { pathExists, readJson, writeJsonAtomic } from "./system/fs.ts";

export function createDefaultConfig({ docsPath, directorTool, reviewerTool, coderabbitEnabled }) {
  return {
    schema_version: SCHEMA_VERSION,
    autoUpdate: DEFAULT_AUTO_UPDATE,
    agents: {
      director: {
        tool: directorTool,
      },
      reviewers: reviewerTool ? [{ tool: reviewerTool }] : [],
    },
    audit_tools: SUPPORTED_AUDIT_TOOLS.map((id) => ({
      id,
      enabled: id === AUDIT_TOOLS.CODERABBIT ? coderabbitEnabled : false,
      auto_implement: {
        enabled: false,  // Conservative default: don't auto-implement
        min_severity: "minor",  // Only auto-implement minor+ severity findings
        only_refactor_suggestions: false,  // Apply all findings above min_severity
      },
    })),
    context: {
      docs_path: docsPath,
      max_docs_bytes: DEFAULT_MAX_DOCS_BYTES,
    },
  };
}

export async function loadConfig(cwd) {
  const configPath = path.join(cwd, CONFIG_PATH);
  if (!(await pathExists(configPath))) {
    throw new Error("Missing .roboreviewer/config.json. Run `roboreviewer init` first.");
  }

  const config = await readJson(configPath);
  validateConfig({ config, cwd });
  return config;
}

export function validateConfig({ config, cwd }) {
  if (config.schema_version !== SCHEMA_VERSION) {
    throw new Error(`Unsupported config schema version: ${config.schema_version}`);
  }

  // Schema version 1 in this repository requires autoUpdate.
  // Backward compatibility with pre-release config variants is not supported.
  if (typeof config.autoUpdate !== "boolean") {
    throw new Error("autoUpdate must be a boolean.");
  }

  const directorTool = config?.agents?.director?.tool;
  if (!SUPPORTED_AGENT_TOOLS.includes(directorTool)) {
    throw new Error(`Unsupported director tool: ${directorTool}`);
  }

  const reviewers = config?.agents?.reviewers ?? [];
  if (!Array.isArray(reviewers) || reviewers.length > 1) {
    throw new Error("v1 supports zero or one additional reviewer.");
  }

  for (const reviewer of reviewers) {
    if (!SUPPORTED_AGENT_TOOLS.includes(reviewer.tool)) {
      throw new Error(`Unsupported reviewer tool: ${reviewer.tool}`);
    }
  }

  if (typeof config?.context?.max_docs_bytes !== "number" || config.context.max_docs_bytes <= 0) {
    throw new Error("context.max_docs_bytes must be a positive number.");
  }

  const docsPath = config?.context?.docs_path;
  if (docsPath) {
    const fullPath = path.join(cwd, docsPath);
    if (!path.isAbsolute(docsPath) && fullPath.includes("..")) {
      throw new Error("context.docs_path must stay within the repository.");
    }
  }
}

export async function saveConfig({ cwd, config }) {
  await writeJsonAtomic({ filePath: path.join(cwd, CONFIG_PATH), value: config });
}
