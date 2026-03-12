import { SESSION_PATH } from "../../constants.ts";
import { INTERNAL_CONFIG } from "../../internal-config.ts";
import { renderSectionHeader } from "./helper-functions.ts";
import { renderNotAdoptedAuditFindings } from "./render-audit-sections.ts";
import { renderNonConsensusAfterCompletion } from "./render-review-sections.ts";

export function renderReviewCompletion({ session }: { session: any }) {
  return [
    "",
    renderNotAdoptedAuditFindings({ session }),
    renderSectionHeader({ title: INTERNAL_CONFIG.cli.review.completionTitle, tone: "green" }),
    `See ${SESSION_PATH} for full audit details.`,
    renderNonConsensusAfterCompletion({ session }),
  ]
    .filter((section) => section !== "")
    .join("\n");
}
