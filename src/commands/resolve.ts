import { loadConfig } from "../lib/config.ts";
import { CONFLICT_STATUSES, CURSOR_PHASES, HUMAN_DECISION_LABELS } from "../lib/constants.ts";
import { loadDocumentationContext } from "../lib/docs.ts";
import { withPrompter } from "../lib/system/interactive.ts";
import { formatConflictPrompt, hasPendingConflict, isResolvedConflict, mapResolutionDecision } from "../lib/runtime/resolve-flow.ts";
import { buildSummary } from "../lib/runtime/summary.ts";
import { loadSession, saveSession, saveSessionSummary } from "../lib/runtime/session.ts";
import { finalizeResolvedConflicts } from "../lib/runtime/workflow.ts";

export async function runResolveCommand() {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const session = await loadSession(cwd);

  if (
    !session.cursor ||
    (session.cursor.phase !== CURSOR_PHASES.HITL_RESOLUTION &&
      session.cursor.phase !== CURSOR_PHASES.FINAL_IMPLEMENTATION)
  ) {
    throw new Error("No pending resolution workflow found.");
  }

  if (session.cursor.phase === CURSOR_PHASES.HITL_RESOLUTION) {
    await walkConflicts({ cwd, session });
    session.cursor = { phase: CURSOR_PHASES.FINAL_IMPLEMENTATION, next_conflict_index: session.conflicts.length };
    await saveSession({ cwd, session });
  }

  const docsContext = await loadDocumentationContext({
    cwd,
    docsPath: config.context.docs_path,
    maxDocsBytes: config.context.max_docs_bytes,
  });
  const updatedSession = await finalizeResolvedConflicts({
    cwd,
    config,
    session,
    docsText: docsContext.docsText,
  });

  await saveSession({ cwd, session: updatedSession });
  await saveSessionSummary({ cwd, session: updatedSession, summary: buildSummary(updatedSession) });
  process.stdout.write("Resolution complete.\n");
}

async function walkConflicts({ cwd, session }) {
  await withPrompter(async (prompt) => {
    while (hasPendingConflict(session)) {
      const index = session.cursor.next_conflict_index;
      const conflict = session.conflicts[index];
      if (isResolvedConflict(conflict)) {
        session.cursor.next_conflict_index += 1;
        continue;
      }

      const finding = session.findings.find((item) => item.finding_id === conflict.finding_id);
      process.stdout.write(
        formatConflictPrompt({
          index,
          total: session.conflicts.length,
          fallbackId: conflict.finding_id,
          finding,
        }),
      );

      const decision = await prompt.choose(
        "Decision",
        [
          HUMAN_DECISION_LABELS.IMPLEMENT_DISPUTED_RECOMMENDATION,
          HUMAN_DECISION_LABELS.DISCARD_DISPUTED_RECOMMENDATION,
        ],
        0,
      );
      conflict.human_decision = mapResolutionDecision({ decision });
      conflict.status = CONFLICT_STATUSES.RESOLVED;
      session.cursor.next_conflict_index += 1;
      await saveSession({ cwd, session });
    }
  });
}
