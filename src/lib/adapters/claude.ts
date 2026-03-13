import { AGENT_TOOLS, AUDIT_ASSESSMENT_DISPOSITIONS, EXECUTION_STATUSES, REQUEST_TYPES } from "../constants.ts";
import { FINDING_CATEGORY_LIST, FINDING_SEVERITY_LIST } from "../internal-config.ts";
import {
  buildCommonPromptSections,
  buildReviewFocusSection,
  createImplementationResponse,
  createPushbackResponse,
  createReviewResponse,
} from "./shared.ts";
import { runCommand, type CommandResult } from "../system/shell.ts";

export function createClaudeAdapter() {
  return {
    id: AGENT_TOOLS.CLAUDE_CODE,
    async healthcheck() {
      await runClaudeMetaCommand({ args: ["--version"], cwd: process.cwd() });
      return { ok: true };
    },
    async probeCapabilities() {
      await runClaudeMetaCommand({ args: ["--help"], cwd: process.cwd() });
      return {
        headless: true,
        structuredOutput: true,
      };
    },
    classifyError(error: unknown) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (message.includes("overloaded") || message.includes("timeout")) {
        return "retryable";
      }
      return "terminal";
    },
    async execute(request: any) {
      const promptText = buildPrompt(request);
      const result = await runClaudeRequest(request);
      if (request.type === REQUEST_TYPES.PUSHBACK_RESPONSE) {
        return createPushbackResponse(result, promptText);
      }
      if (request.type === REQUEST_TYPES.IMPLEMENT) {
        return createImplementationResponse(result, promptText);
      }
      return createReviewResponse(result, promptText);
    },
  };
}

const CLAUDE_INPUT_ERROR =
  "Input must be provided either through stdin or as a prompt argument when using --print";

function createIsolatedHome(cwd: string): string {
  return `${cwd}/.roboreviewer/runtime/claude-home`;
}

async function runClaudeMetaCommand({ args, cwd }: { args: string[]; cwd: string }): Promise<CommandResult> {
  try {
    return await runCommand({
      command: "claude",
      args,
      cwd,
      env: process.env,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(".claude/debug")) {
      throw error;
    }
    return runCommand({
      command: "claude",
      args,
      cwd,
      env: {
        ...process.env,
        HOME: createIsolatedHome(cwd),
      },
    });
  }
}

function buildContract(requestType: string) {
  if (requestType === REQUEST_TYPES.IMPLEMENT) {
    return {
      status: EXECUTION_STATUSES.OK,
      summary: "string",
    };
  }

  if (requestType === REQUEST_TYPES.PUSHBACK_RESPONSE) {
    return {
      responses: [
        {
          finding_id: "string",
          withdrawn: true,
          note: "string",
        },
      ],
    };
  }

  return {
    findings: [
      {
        category: FINDING_CATEGORY_LIST,
        severity: FINDING_SEVERITY_LIST,
        location: { file: "path/to/file", line: 1 },
        summary: "string",
        recommendation: "string",
        related_audit_ids: ["coderabbit-a-001"],
      },
    ],
    audit_assessments: [
      {
        audit_finding_id: "coderabbit-a-001",
        disposition: AUDIT_ASSESSMENT_DISPOSITIONS.ADOPT,
        note: "string",
      },
    ],
    comments: [
      {
        finding_id: "f-001",
        stance: "agree|pushback",
        note: "string",
      },
    ],
  };
}

function buildPrompt(request: any): string {
  const contract = JSON.stringify(buildContract(request.type), null, 2);
  if (request.type === REQUEST_TYPES.REVIEW) {
    return [
      "You are Roboreviewer running a strict structured review.",
      "Return only valid JSON and no surrounding commentary.",
      "Use repository-relative file paths.",
      buildReviewFocusSection(),
      "Audit findings provided have been pre-filtered. You may reference them in related_audit_ids if your findings relate to them.",
      "If a finding validates or builds upon an audit tool finding, include the matching audit ID in related_audit_ids.",
      "",
      `JSON contract:\n${contract}`,
      ...buildCommonPromptSections(request),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (request.type === REQUEST_TYPES.PEER_REVIEW) {
    return [
      "You are Roboreviewer performing peer review of another agent's findings.",
      "You have read-only file access. Use the Read tool to examine files mentioned in findings to verify their validity.",
      "For each finding, determine if it's correct and actionable by reading the relevant code.",
      "If a finding has potential_duplicate_of field, consider whether it's redundant with the referenced finding.",
      "Return only valid JSON and no surrounding commentary.",
      `JSON contract:\n${contract}`,
      ...buildCommonPromptSections(request),
    ].join("\n\n");
  }

  if (request.type === REQUEST_TYPES.PUSHBACK_RESPONSE) {
    return [
      "You are Roboreviewer responding to pushback on your findings.",
      "You have read-only file access. Use the Read tool to re-examine code if needed to address pushback.",
      "Return only valid JSON and no surrounding commentary.",
      `JSON contract:\n${contract}`,
      `Source reviewer id: ${request.reviewerId}`,
      ...buildCommonPromptSections(request),
    ].join("\n\n");
  }

  if (request.type === REQUEST_TYPES.IMPLEMENT) {
    return [
      "You are Roboreviewer implementing accepted findings directly in the working tree.",
      "Make the smallest changes that fully satisfy the accepted findings.",
      "Return only valid JSON and no surrounding commentary after edits are complete.",
      `JSON contract:\n${contract}`,
      ...buildCommonPromptSections(request),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  throw new Error(`Unsupported Claude request type: ${request.type}`);
}

function buildSystemPrompt() {
  return [
    "You are Roboreviewer.",
    "When asked for structured output, you must return exactly one valid JSON value.",
    "Do not include markdown fences, prose, summaries, headings, or explanations outside the JSON.",
    "If you are unsure, return the closest valid JSON object matching the requested contract.",
  ].join(" ");
}

function extractTextPayload(rawOutput: string): string {
  const parsed = JSON.parse(rawOutput) as any;
  if (typeof parsed.result === "string") {
    return parsed.result;
  }
  if (typeof parsed.output === "string") {
    return parsed.output;
  }
  if (Array.isArray(parsed.content)) {
    return parsed.content
      .map((item) => item?.text)
      .filter(Boolean)
      .join("\n");
  }
  if (parsed.message?.content) {
    return parsed.message.content
      .map((item) => item?.text)
      .filter(Boolean)
      .join("\n");
  }
  throw new Error("Unable to extract Claude JSON response payload.");
}

function parseJsonObject(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const candidates = [
      extractFencedJson({ text: trimmed }),
      extractBalancedJson({ text: trimmed, opener: "{", closer: "}" }),
      extractBalancedJson({ text: trimmed, opener: "[", closer: "]" }),
    ].filter(Boolean);

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        continue;
      }
    }
    throw new Error(`Claude response was not valid JSON. Preview: ${buildResponsePreview({ text: trimmed })}`);
  }
}

function extractFencedJson({ text }: { text: string }) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fencedMatch?.[1]?.trim() ?? "";
}

function extractBalancedJson({
  text,
  opener,
  closer,
}: {
  text: string;
  opener: "{" | "[";
  closer: "}" | "]";
}) {
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === opener) {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === closer && depth > 0) {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return "";
}

function buildResponsePreview({ text }: { text: string }) {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

async function runClaudeRequest(request: any): Promise<any> {
  const args = [
    "--print",
    "--output-format",
    "json",
    "--system-prompt",
    buildSystemPrompt(),
    "--permission-mode",
    request.type === REQUEST_TYPES.IMPLEMENT ? "acceptEdits" : "default",
  ];

  if (request.type === REQUEST_TYPES.IMPLEMENT) {
    args.push(
      "--allowedTools",
      "Edit,Bash(git:*),Bash(ls:*),Bash(cat:*),Bash(sed:*),Bash(rg:*),Bash(find:*),Bash(node:*)",
    );
    args.push("--add-dir", request.cwd);
  } else if (request.type === REQUEST_TYPES.PEER_REVIEW || request.type === REQUEST_TYPES.PUSHBACK_RESPONSE) {
    // Peer reviewers need read-only access to verify findings against actual code
    // They receive findings (not full diff) and read only files they need to verify
    // This reduces token usage while maintaining review quality
    args.push(
      "--allowedTools",
      "Read,Bash(git:*),Bash(ls:*),Bash(cat:*),Bash(rg:*),Bash(find:*)",
    );
    args.push("--add-dir", request.cwd);
  }

  const result = await runClaudeCommand({
    cwd: request.cwd,
    requestType: request.type,
    args,
    input: buildPrompt(request),
  });

  const responseText = extractTextPayload(result.stdout);
  try {
    return parseJsonObject(responseText);
  } catch (error) {
    return repairClaudeJsonResponse({
      cwd: request.cwd,
      requestType: request.type,
      responseText,
      originalError: error instanceof Error ? error.message : String(error),
    });
  }
}

async function repairClaudeJsonResponse({
  cwd,
  requestType,
  responseText,
  originalError,
}: {
  cwd: string;
  requestType: string;
  responseText: string;
  originalError: string;
}) {
  const contract = JSON.stringify(buildContract(requestType), null, 2);
  const repairPrompt = [
    "Rewrite the following response as valid JSON only.",
    "Return exactly one JSON value matching this contract.",
    `JSON contract:\n${contract}`,
    `Previous parse error: ${originalError}`,
    "Original response:",
    responseText,
  ].join("\n\n");

  const result = await runClaudeCommand({
    cwd,
    requestType,
    args: [
      "--print",
      "--output-format",
      "json",
      "--system-prompt",
      buildSystemPrompt(),
      "--permission-mode",
      "default",
    ],
    input: repairPrompt,
    isRepair: true,
  });

  return parseJsonObject(extractTextPayload(result.stdout));
}

async function runClaudeCommand({
  cwd,
  requestType,
  args,
  input,
  isRepair = false,
}: {
  cwd: string;
  requestType: string;
  args: string[];
  input: string;
  isRepair?: boolean;
}) {
  try {
    return await runCommand({
      command: "claude",
      args,
      cwd,
      env: process.env,
      input,
    });
  } catch (error) {
    throw new Error(
      sanitizeClaudeErrorMessage({
        requestType,
        error,
        isRepair,
      }),
    );
  }
}

export function sanitizeClaudeErrorMessage({
  requestType,
  error,
  isRepair = false,
}: {
  requestType: string;
  error: unknown;
  isRepair?: boolean;
}) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const lines = rawMessage
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const explicitErrorLine =
    lines.find((line) => line.includes(CLAUDE_INPUT_ERROR)) ??
    lines.find((line) => line.toLowerCase().startsWith("error:")) ??
    lines.at(-1) ??
    "Unknown Claude CLI error.";
  const cleanedDetail = explicitErrorLine
    .replace(/^error:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  const phase = isRepair ? "repair" : "request";
  return `Claude ${requestType} ${phase} failed: ${cleanedDetail}`;
}
