import { CURSOR_PHASES, DECIDED_BY, FINDING_STATUSES, RESOLUTION_STATUSES } from "../constants.ts";
import {
  formatConfirmPrompt,
  formatConsensusHeader,
  formatLabel,
  formatLocation,
} from "../output/review-output/helper-functions.ts";
import { type Prompter, withPrompter } from "../system/interactive.ts";
import { saveSession } from "./session.ts";

export async function collectConsensusApprovalDecisions({
  cwd,
  session,
  prompt,
}: {
  cwd: string;
  session: any;
  prompt?: Prompter;
}) {
  const approvalByFindingId = new Map<string, boolean>();
  const execute = async (activePrompt: Prompter) => {
    while (hasPendingConsensusApproval(session)) {
      const index = session.cursor.next_finding_index;
      const findingId = session.cursor.finding_ids[index];
      const finding = session.findings.find((item) => item.finding_id === findingId);
      if (!finding) {
        session.cursor.next_finding_index += 1;
        await persistSession({ cwd, session });
        continue;
      }

      process.stdout.write(renderConsensusApprovalPrompt({
        index,
        total: session.cursor.finding_ids.length,
        finding,
      }));
      const approved = await activePrompt.confirm(
        formatConfirmPrompt({ message: "Approve this consensus update?" }),
        true,
      );
      approvalByFindingId.set(finding.finding_id, approved);
      applyApprovalPreview({ session, findingId: finding.finding_id, approved });
      session.cursor.next_finding_index += 1;
      await persistSession({ cwd, session });
    }
  };

  if (prompt) {
    await execute(prompt);
    return approvalByFindingId;
  }

  await withPrompter(execute);
  return approvalByFindingId;
}

function renderConsensusApprovalPrompt({
  index,
  total,
  finding,
}: {
  index: number;
  total: number;
  finding: any;
}) {
  const lines = [
    "",
    formatConsensusHeader({
      index,
      total,
      findingId: finding.finding_id,
    }),
    formatLocation({ finding }),
    finding.summary,
  ];

  if (finding.recommendation) {
    lines.push(`${formatLabel({ label: "Recommendation" })} ${finding.recommendation}`);
  }

  return `${lines.join("\n")}\n`;
}

export function hasPendingConsensusApproval(session: any) {
  return (
    session.cursor &&
    session.cursor.phase === CURSOR_PHASES.MANUAL_CONSENSUS_APPROVAL &&
    session.cursor.next_finding_index < session.cursor.finding_ids.length
  );
}

function applyApprovalPreview({
  session,
  findingId,
  approved,
}: {
  session: any;
  findingId: string;
  approved: boolean;
}) {
  session.findings = session.findings.map((finding) => {
    if (finding.finding_id !== findingId) {
      return finding;
    }

    return {
      ...finding,
      user_approved: approved,
      decided_by: DECIDED_BY.USER,
      resolution_status: approved ? null : RESOLUTION_STATUSES.DISCARDED,
      status: approved ? finding.status : FINDING_STATUSES.RESOLVED,
    };
  });
}

async function persistSession({ cwd, session }: { cwd: string; session: any }) {
  await saveSession({ cwd, session });
}
