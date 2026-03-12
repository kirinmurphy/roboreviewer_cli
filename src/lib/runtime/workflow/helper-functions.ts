import { REQUEST_TYPES } from "../../constants.ts";
import { listChangedFiles } from "../../system/git.ts";

export async function verifyReviewers({ reviewers, onProgress }) {
  emitProgress({
    onProgress,
    message: `Checking ${reviewers.length} reviewer adapter(s)`,
  });
  for (const reviewer of reviewers) {
    emitProgress({
      onProgress,
      message: `Verifying ${reviewer.tool}`,
    });
    await reviewer.adapter.healthcheck();
    await reviewer.adapter.probeCapabilities();
  }
}

export async function runImplementation({ cwd, director, findings, docsText, baseRef }) {
  if (findings.length === 0) {
    return {
      filesTouched: [],
      raw: "no-op",
    };
  }

  const result = await director.adapter.execute({
    type: REQUEST_TYPES.IMPLEMENT,
    cwd,
    findings,
    docsText,
  });
  const filesTouched = await listChangedFiles({ cwd, diffBase: baseRef });
  return {
    filesTouched: filesTouched.length > 0 ? filesTouched : result.files_touched ?? [],
    raw: result.raw,
  };
}

export function replaceFindings({ existingFindings, nextFindings }: { existingFindings: any[]; nextFindings: any[] }) {
  const nextById = new Map(nextFindings.map((finding) => [finding.finding_id, finding]));
  return existingFindings.map((finding) => nextById.get(finding.finding_id) ?? finding);
}

export function emitProgress({ onProgress, message }) {
  if (typeof onProgress === "function") {
    onProgress(message);
  }
}

export async function checkpointSession({ onCheckpoint, session }) {
  if (typeof onCheckpoint === "function") {
    await onCheckpoint({ session });
  }
}
