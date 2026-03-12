import fs from "node:fs/promises";
import path from "node:path";
import { AGENT_TOOLS, AUDIT_ASSESSMENT_DISPOSITIONS, EXECUTION_STATUSES, REQUEST_TYPES, TMP_DIR } from "../constants.ts";
import { ensureDir } from "../system/fs.ts";
import { INTERNAL_CONFIG } from "../internal-config.ts";
import { runCommand } from "../system/shell.ts";
import {
  buildCommonPromptSections,
  buildReviewFocusSection,
  createImplementationResponse,
  createPushbackResponse,
  createReviewResponse,
} from "./shared.ts";

export function createCodexAdapter() {
  return {
    id: AGENT_TOOLS.CODEX,
    async healthcheck() {
      await runCommand({ command: AGENT_TOOLS.CODEX, args: ["--version"] });
      return { ok: true };
    },
    async probeCapabilities() {
      return {
        headless: true,
        structuredOutput: true,
      };
    },
    classifyError(error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      return message.includes("timeout") ? "retryable" : "terminal";
    },
    async execute(request) {
      const result = await runCodexRequest(request);
      if (request.type === REQUEST_TYPES.PUSHBACK_RESPONSE) {
        return createPushbackResponse(result);
      }
      if (request.type === REQUEST_TYPES.IMPLEMENT) {
        return createImplementationResponse(result);
      }
      return createReviewResponse(result);
    },
  };
}

function buildSchema(requestType) {
  if (requestType === REQUEST_TYPES.IMPLEMENT) {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string" },
        summary: { type: "string" },
      },
      required: ["status", "summary"],
    };
  }

  if (requestType === REQUEST_TYPES.PUSHBACK_RESPONSE) {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        responses: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              finding_id: { type: "string" },
              withdrawn: { type: "boolean" },
              note: { type: "string" },
            },
            required: ["finding_id", "withdrawn", "note"],
          },
        },
      },
      required: ["responses"],
    };
  }

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      findings: {
        type: "array",
        items: {
            type: "object",
            additionalProperties: false,
          properties: {
            category: { type: "string", enum: [...INTERNAL_CONFIG.findings.categories] },
            severity: { type: "string", enum: [...INTERNAL_CONFIG.findings.severities] },
            location: {
              type: "object",
              additionalProperties: false,
              properties: {
                file: { type: "string" },
                line: { type: "number" },
              },
              required: ["file", "line"],
            },
            summary: { type: "string" },
            recommendation: { type: "string" },
            related_audit_ids: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["category", "severity", "location", "summary", "recommendation", "related_audit_ids"],
        },
      },
      audit_assessments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            audit_finding_id: { type: "string" },
            disposition: { type: "string", enum: [...Object.values(AUDIT_ASSESSMENT_DISPOSITIONS)] },
            note: { type: "string" },
          },
          required: ["audit_finding_id", "disposition", "note"],
        },
      },
      comments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            finding_id: { type: "string" },
            stance: { type: "string" },
            note: { type: "string" },
          },
          required: ["finding_id", "stance", "note"],
        },
      },
    },
    required: ["findings", "audit_assessments", "comments"],
  };
}

function buildPrompt(request) {
  if (request.type === REQUEST_TYPES.REVIEW) {
    return [
      "You are Roboreviewer running a strict structured review.",
      "Review only the provided diff and optional context.",
      "Return findings only for concrete issues worth fixing in this review window.",
      buildReviewFocusSection(),
      "For every provided audit finding, return an audit_assessments entry with disposition adopt or reject and a concise reason.",
      "If you adopt an audit finding, also emit a normal finding that references its audit_finding_id in related_audit_ids.",
      "Use repository-relative file paths.",
      "If a finding is based on audit tool output, include the matching audit ID in related_audit_ids.",
      ...buildCommonPromptSections(request),
    ].join("\n");
  }

  if (request.type === REQUEST_TYPES.PEER_REVIEW) {
    return [
      "You are Roboreviewer performing peer review of another agent's findings.",
      "For each finding, either agree or push back.",
      "Push back only when the finding is incorrect, out of scope, or too weak to justify action.",
      ...buildCommonPromptSections(request),
    ].join("\n");
  }

  if (request.type === REQUEST_TYPES.PUSHBACK_RESPONSE) {
    return [
      "You are Roboreviewer responding to peer pushback on your findings.",
      "For each pushed-back finding, decide whether to withdraw it.",
      "Withdraw only if the pushback is correct or the finding should not block the change.",
      "",
      `Source reviewer id: ${request.reviewerId}`,
      ...buildCommonPromptSections(request),
    ].join("\n");
  }

  if (request.type === REQUEST_TYPES.IMPLEMENT) {
    return [
      "You are Roboreviewer implementing accepted findings directly in the working tree.",
      "Make the smallest changes that fully satisfy the accepted findings.",
      "Do not create commits or branches.",
      ...buildCommonPromptSections(request),
    ].join("\n");
  }

  throw new Error(`Unsupported request type: ${request.type}`);
}

async function runCodexRequest(request) {
  const runtimeTmpDir = path.join(request.cwd, TMP_DIR);
  await ensureDir(runtimeTmpDir);
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const schemaPath = path.join(runtimeTmpDir, `schema-${token}.json`);
  const outputPath = path.join(runtimeTmpDir, `output-${token}.json`);

  await fs.writeFile(schemaPath, `${JSON.stringify(buildSchema(request.type), null, 2)}\n`, "utf8");

  const args = [
    "exec",
    "-",
    "-C",
    request.cwd,
    "--ephemeral",
    "--color",
    "never",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "--sandbox",
    request.type === REQUEST_TYPES.IMPLEMENT ? "workspace-write" : "read-only",
  ];

  try {
    await runCommand({
      command: AGENT_TOOLS.CODEX,
      args,
      cwd: request.cwd,
      input: buildPrompt(request),
    });
  } catch (error) {
    throw new Error(formatCodexError({ error }));
  }

  const raw = await fs.readFile(outputPath, "utf8");
  return JSON.parse(raw);
}

function formatCodexError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const apiMessage = extractCodexApiMessage({ message });
  if (apiMessage) {
    return `Codex request failed: ${apiMessage}`;
  }
  return message;
}

function extractCodexApiMessage({ message }: { message: string }) {
  const invalidSchemaMatch = message.match(/"message"\s*:\s*"([^"]+)"/);
  if (invalidSchemaMatch?.[1]) {
    return invalidSchemaMatch[1];
  }

  const errorLine = message
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("error: ") || line.startsWith("ERROR:"));
  if (errorLine) {
    return errorLine.replace(/^ERROR:\s*/, "").replace(/^error:\s*/, "");
  }

  return "";
}
