import { CONFLICT_STATUSES, CURSOR_PHASES, HUMAN_DECISION_LABELS } from "../constants.ts";
import { loadDocumentationContext } from "../docs.ts";
import { formatConfirmPrompt } from "../output/review-output/helper-functions.ts";
import { type Prompter, withPrompter } from "../system/interactive.ts";
import { saveSession } from "./session.ts";
import { finalizeResolvedConflicts } from "./workflow/finalizeResolvedConflicts.ts";
import { formatConflictPrompt, hasPendingConflict, isResolvedConflict, mapResolutionDecision } from "./resolve-flow.ts";

export async function runResolveWorkflow({ cwd, config, session, prompt }: { cwd: string; config: any; session: any; prompt?: Prompter }) {
  if (
    !session.cursor ||
    (session.cursor.phase !== CURSOR_PHASES.HITL_RESOLUTION &&
      session.cursor.phase !== CURSOR_PHASES.FINAL_IMPLEMENTATION)
  ) {
    throw new Error("No pending resolution workflow found.");
  }

  if (session.cursor.phase === CURSOR_PHASES.HITL_RESOLUTION) {
    await collectConflictDecisions({ cwd, session, prompt });
    session.cursor = {
      ...session.cursor,
      phase: CURSOR_PHASES.FINAL_IMPLEMENTATION,
      next_conflict_index: session.conflicts.length,
    };
    await persistSession({ cwd, session });
  }

  const updatedSession = await finalizeResolvedConflicts({
    cwd,
    config,
    session,
  });

  await persistSession({ cwd, session: updatedSession });
  return updatedSession;
}

export async function collectConflictDecisions({ cwd, session, prompt }: { cwd: string; session: any; prompt?: Prompter }) {
  const execute = async (activePrompt: Prompter) => {
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

      const decision = await activePrompt.choose(
        formatConfirmPrompt({ message: "Decision" }),
        [
          HUMAN_DECISION_LABELS.IMPLEMENT_DISPUTED_RECOMMENDATION,
          HUMAN_DECISION_LABELS.DISCARD_DISPUTED_RECOMMENDATION,
        ],
        0,
      );
      conflict.human_decision = mapResolutionDecision({ decision });
      conflict.status = CONFLICT_STATUSES.RESOLVED;
      session.cursor.next_conflict_index += 1;
      await persistSession({ cwd, session });
    }
  };

  if (prompt) {
    await execute(prompt);
    return;
  }

  await withPrompter(execute);
}

async function persistSession({ cwd, session }) {
  await saveSession({ cwd, session });
}
