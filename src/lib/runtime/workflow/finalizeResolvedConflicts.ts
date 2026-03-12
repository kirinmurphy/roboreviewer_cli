import { HUMAN_DECISIONS, SESSION_STATUSES } from "../../constants.ts";
import { createAdapter } from "../../adapters/index.ts";
import { listChangedFiles } from "../../system/git.ts";
import { applyConflictResolutionDecisions, createImplementationRun, markImplementedFindings, resolveConflicts, WORKFLOW_PHASES } from "../workflow-state/index.ts";
import { runImplementation } from "./helper-functions.ts";

export async function finalizeResolvedConflicts({ cwd, config, session, docsText }) {
  const director = createAdapter(config.agents.director.tool);
  await director.healthcheck();

  const implementFindings = session.conflicts
    .filter((conflict) => conflict.human_decision === HUMAN_DECISIONS.IMPLEMENT_DISPUTED_RECOMMENDATION)
    .map((conflict) => session.findings.find((finding) => finding.finding_id === conflict.finding_id))
    .filter(Boolean);

  const implementation = await runImplementation({
    cwd,
    director: { adapter: director },
    findings: implementFindings,
    docsText,
    baseRef: "HEAD",
  });

  session.findings = markImplementedFindings({
    findings: applyConflictResolutionDecisions({
      findings: session.findings,
      conflicts: session.conflicts,
    }),
    implementationReady: implementFindings,
  });
  session.conflicts = resolveConflicts(session.conflicts);
  session.implementation_runs.push(createImplementationRun({ phase: WORKFLOW_PHASES.RESOLVE, implementation }));
  session.review_target.changed_files = await listChangedFiles({ cwd, diffBase: "HEAD" });
  session.cursor = null;
  session.status = SESSION_STATUSES.COMPLETE;

  return session;
}
