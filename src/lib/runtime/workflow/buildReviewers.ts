import {
  REVIEWER_IDS,
  REVIEWER_ROLES,
} from "../../constants.ts";
import { createAdapter } from "../../adapters/index.ts";

type WorkflowReviewer = {
  reviewer_id: string;
  tool: string;
  adapter: ReturnType<typeof createAdapter>;
  role: string;
};

export function buildReviewers(config): WorkflowReviewer[] {
  const directorTool = config.agents.director.tool;
  const reviewers: WorkflowReviewer[] = [
    {
      reviewer_id: REVIEWER_IDS.PRIMARY,
      tool: directorTool,
      adapter: createAdapter(directorTool),
      role: REVIEWER_ROLES.DIRECTOR,
    },
  ];
  const secondaryTool = config.agents.reviewers?.[0]?.tool;
  if (secondaryTool) {
    reviewers.push({
      reviewer_id: REVIEWER_IDS.SECONDARY,
      tool: secondaryTool,
      adapter: createAdapter(secondaryTool),
      role: REVIEWER_ROLES.REVIEWER,
    });
  }
  return reviewers;
}
