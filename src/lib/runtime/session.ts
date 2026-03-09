import path from "node:path";
import {
  HISTORY_DIR,
  RUNTIME_DIR,
  SCHEMA_VERSION,
  SESSION_PATH,
  SESSION_STATUSES,
  SUMMARY_PATH,
  TMP_DIR,
} from "../constants.ts";
import { clearDir, ensureDir, pathExists, readJson, writeJsonAtomic, writeTextAtomic } from "../system/fs.ts";

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
    summaryPath: path.join(cwd, SUMMARY_PATH),
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

export async function saveSummary({ cwd, summary }) {
  await writeTextAtomic({ filePath: path.join(cwd, SUMMARY_PATH), value: summary });
}

export async function saveSessionSummary({ cwd, session, summary }) {
  await saveSummary({ cwd, summary });
  await writeTextAtomic({
    filePath: getHistorySummaryPath({ cwd, sessionId: session.session_id }),
    value: summary,
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
      resolved_commit_count: reviewTarget.commitShas.length,
      commits: reviewTarget.commitMessages,
      changed_files: [],
    },
    context: {
      docs_files: docsFiles,
      docs_bytes: docsBytes,
      redaction_event_count: redactionCount,
    },
    audit_runs: auditRuns.map((run) => ({
      id: run.id,
      status: run.status,
      advisory: run.advisory,
      error: run.error ?? null,
      finding_count: Array.isArray(run.findings) ? run.findings.length : 0,
    })),
    audit_findings: [],
    findings: [],
    conflicts: [],
    iterations: [],
    cursor: null,
    implementation_runs: [],
    failure: null,
    updated_at: new Date().toISOString(),
  };
}

function getHistorySessionPath({ cwd, sessionId }: { cwd: string; sessionId: string }) {
  return path.join(cwd, HISTORY_DIR, sessionId, "session.json");
}

function getHistorySummaryPath({ cwd, sessionId }: { cwd: string; sessionId: string }) {
  return path.join(cwd, HISTORY_DIR, sessionId, "ROBOREVIEWER_SUMMARY.md");
}
