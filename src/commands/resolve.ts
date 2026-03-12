import { loadConfig } from "../lib/config.ts";
import { SESSION_STATUSES } from "../lib/constants.ts";
import { loadSession } from "../lib/runtime/session.ts";
import { runResolveWorkflow } from "../lib/runtime/resolve-workflow.ts";

export async function runResolveCommand() {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const session = await loadSession(cwd);
  const updatedSession = await runResolveWorkflow({ cwd, config, session });

  process.stdout.write(
    updatedSession.status === SESSION_STATUSES.COMPLETE
      ? "Resolution complete.\n"
      : "Resolution paused with remaining non-consensus findings.\n",
  );
}
