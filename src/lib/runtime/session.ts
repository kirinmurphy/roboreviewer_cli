import path from "node:path";
import {
  HISTORY_DIR,
  RUNTIME_DIR,
  SCHEMA_VERSION,
  SESSION_PATH,
  SESSION_STATUSES,
  TMP_DIR,
} from "../constants.ts";
import { clearDir, ensureDir, pathExists, readJson, writeJsonAtomic } from "../system/fs.ts";

export async function ensureRuntime(cwd) {
  await ensureDir(path.join(cwd, RUNTIME_DIR));
  await ensureDir(path.join(cwd, HISTORY_DIR));
  await ensureDir(path.join(cwd, TMP_DIR));
}

export async function clearRuntimeTmp({ cwd }) {
  await clearDir(path.join(cwd, TMP_DIR));
}

export function getRuntimePaths({ cwd }) {
  return {
    runtimeDir: path.join(cwd, RUNTIME_DIR),
    sessionPath: path.join(cwd, SESSION_PATH),
    historyDir: path.join(cwd, HISTORY_DIR),
    tmpDir: path.join(cwd, TMP_DIR),
  };
}

export async function loadSession(cwd) {
  const sessionPath = path.join(cwd, SESSION_PATH);
  if (!(await pathExists(sessionPath))) {
    throw new Error("No runtime session found.");
  }
  return readJson(sessionPath);
}

export async function saveSession({ cwd, session }) {
  session.updated_at = new Date().toISOString();
  await writeJsonAtomic({ filePath: path.join(cwd, SESSION_PATH), value: session });
  await writeJsonAtomic({
    filePath: getHistorySessionPath({ cwd, sessionId: session.session_id }),
    value: session,
  });
}

export function createSession({ sessionId, reviewTarget, docsFiles, docsBytes, redactionCount, auditRuns }) {
  return {
    schema_version: SCHEMA_VERSION,
    session_id: sessionId,
    status: SESSION_STATUSES.RUNNING,
    review_target: {
      mode: reviewTarget.mode,
      selector: reviewTarget.selector,
      diff_base: reviewTarget.diffBase,
      resolved_commit_count: reviewTarget.commitShas.length,
      commits: reviewTarget.commitMessages,
      changed_files: [],
    },
    context: {
      docs_files: docsFiles,
      docs_bytes: docsBytes,
      redaction_event_count: redactionCount,
    },
    audit_runs: auditRuns.map((run) => createAuditRunSessionRecord({ run })),
    audit_findings: [],
    findings: [],
    reviewer_runs: [],
    conflicts: [],
    iterations: [],
    cursor: null,
    implementation_runs: [],
    token_usage: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_input_bytes: 0,
      total_output_bytes: 0,
      by_phase: {},
    },
    failure: null,
    updated_at: new Date().toISOString(),
  };
}

function createAuditRunSessionRecord({ run }) {
  const findings = Array.isArray(run.findings) ? run.findings : [];
  return {
    id: run.id,
    status: run.status,
    advisory: run.advisory,
    error: run.error ?? null,
    finding_count: findings.length,
    findings: findings.map((finding) => ({
      audit_finding_id: finding.audit_finding_id,
      tool_id: finding.tool_id,
      file: finding.file,
      summary: finding.summary,
      raw_text: finding.raw_text,
      severity: finding.severity ?? null,
      indicator_type: finding.indicator_type ?? null,
      finding_type: finding.finding_type ?? null,
      status: finding.status ?? null,
      adopted_by: Array.isArray(finding.adopted_by) ? finding.adopted_by : [],
    })),
  };
}

function getHistorySessionPath({ cwd, sessionId }: { cwd: string; sessionId: string }) {
  return path.join(cwd, HISTORY_DIR, sessionId, "session.json");
}
