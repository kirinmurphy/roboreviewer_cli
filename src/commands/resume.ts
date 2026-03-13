import { loadConfig } from "../lib/config.ts";
import { SESSION_STATUSES } from "../lib/constants.ts";
import { runResumeWorkflow } from "../lib/runtime/resume-workflow.ts";
import { loadSession } from "../lib/runtime/session.ts";
import { runResolveWorkflow } from "../lib/runtime/resolve-workflow.ts";
import { getReviewCursorMetadata } from "../lib/runtime/workflow-state/index.ts";

export async function runResumeCommand() {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const session = await loadSession(cwd);
  const updatedSession = getReviewCursorMetadata(session.cursor)
    ? await runResumeWorkflow({ cwd, config, session })
    : await runResolveWorkflow({ cwd, config, session });

  process.stdout.write(
    updatedSession.status === SESSION_STATUSES.COMPLETE
      ? "Resume complete.\n"
      : "Resume paused with remaining review steps.\n",
  );
}
