import {
  formatConfirmPrompt,
  formatLabel,
  formatLocation,
  renderSectionHeader,
} from "../output/review-output/helper-functions.ts";
import { type Prompter, withPrompter } from "../system/interactive.ts";

/**
 * Collect user approvals for auto-implementable audit fixes
 * when autoUpdate is false
 */
export async function collectAuditFixApprovals({
  findings,
  prompt,
}: {
  findings: any[];
  prompt?: Prompter;
}): Promise<Map<string, boolean>> {
  const approvals = new Map<string, boolean>();

  const execute = async (activePrompt: Prompter) => {
    process.stdout.write(
      "\n" +
        renderSectionHeader({
          title: `Approve Auto-Implementable Audit Fixes (${findings.length})`,
          tone: "cyan",
        }) +
        "\n"
    );

    for (let index = 0; index < findings.length; index++) {
      const finding = findings[index];

      process.stdout.write(renderAuditFixPrompt({ index, total: findings.length, finding }));

      const approved = await activePrompt.confirm(
        formatConfirmPrompt({ message: "Approve this audit fix?" }),
        true // Default to yes
      );

      approvals.set(finding.finding_id, approved);

      if (approved) {
        process.stdout.write(`  ✓ Approved\n\n`);
      } else {
        process.stdout.write(`  ✗ Skipped\n\n`);
      }
    }
  };

  if (prompt) {
    await execute(prompt);
    return approvals;
  }

  await withPrompter(execute);
  return approvals;
}

function renderAuditFixPrompt({
  index,
  total,
  finding,
}: {
  index: number;
  total: number;
  finding: any;
}): string {
  const lines = [
    "",
    `[${index + 1}/${total}] Audit Fix: ${finding.source_reviewer_tool}`,
    formatLocation({ finding }),
    formatLabel({ label: "Summary" }) + " " + finding.summary,
  ];

  if (finding.severity) {
    lines.push(formatLabel({ label: "Severity" }) + " " + finding.severity);
  }

  return `${lines.join("\n")}\n`;
}
