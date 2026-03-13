import { POST_REVIEW_ACTIONS } from "../../lib/constants.ts";
import { type Prompter } from "../../lib/system/interactive.ts";
import { choosePostReviewAction } from "./helper-functions.ts";
import { runIteration } from "./runIteration.ts";

export async function runPostReviewLoop({
  cwd,
  config,
  session,
  reviewTarget,
  docsOverride,
  writeEvent,
  prompt,
}: RunPostReviewLoopArgs) {
  while (true) {
    const action = await choosePostReviewAction({ prompt });
    if (action === POST_REVIEW_ACTIONS.END_SCAN) {
      return session;
    }

    if (action === POST_REVIEW_ACTIONS.REPEAT_SCAN) {
      session = await runIteration({
        cwd,
        config,
        session,
        reviewTarget,
        docsOverride,
        writeEvent,
        includeWorktree: true,
        prompt,
      });
    }
  }
}

type RunPostReviewLoopArgs = {
  cwd: string;
  config: any;
  session: any;
  reviewTarget: any;
  docsOverride: string | null;
  writeEvent: (event: unknown) => void;
  prompt: Prompter;
};
