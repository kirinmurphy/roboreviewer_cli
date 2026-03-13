import { clearRuntimeTmp } from "../../lib/runtime/session.ts";
import { persistFinalSession } from "./helper-functions.ts";

export async function attemptCleanup({
  cwd,
  session,
}: {
  cwd: string;
  session: any;
}) {
  try {
    if (session) {
      await persistFinalSession({ cwd, session });
    }
  } catch (cleanupError) {
    logCleanupFailure({
      step: "persist final session",
      error: cleanupError,
    });
  }

  try {
    await clearRuntimeTmp({ cwd });
  } catch (cleanupError) {
    logCleanupFailure({
      step: "clear runtime tmp files",
      error: cleanupError,
    });
  }
}

function logCleanupFailure({
  step,
  error,
}: {
  step: string;
  error: unknown;
}) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(
    `Secondary cleanup failure while attempting to ${step}: ${detail}`,
  );
}
