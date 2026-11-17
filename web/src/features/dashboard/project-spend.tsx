/**
 * "Spend by project": this week's spend per `x-project` tag, ranked as the gateway sends it, with
 * untagged requests as "(no project)" and a hint on tagging when nothing is tagged.
 */

import type { ProjectUsage } from "../../api/usage";
import { DotBar } from "./dot-bar";
import { formatMoney, formatPercent, ratioOf } from "./money";

const UNTAGGED = "(no project)";

/** The project list. The gateway already sorts projects by spend, untagged last on ties. */
export function ProjectSpend(props: { projects: readonly ProjectUsage[] }) {
  const { projects } = props;
  const total = projects.reduce((sum, project) => sum + project.spentThisWeekMicros, 0);
  const anyTagged = projects.some((project) => project.projectTag !== null);
  return (
    <section aria-labelledby="projects-heading" className="section">
      <div className="section-head">
        <h2 id="projects-heading">Spend by project</h2>
      </div>
      {projects.length > 0 && (
        <ol className="project-list">
          {projects.map((project) => {
            const label = project.projectTag ?? UNTAGGED;
            const money = formatMoney(project.spentThisWeekMicros);
            const share = ratioOf(project.spentThisWeekMicros, total);
            return (
              <li key={label} className="project-row">
                <span
                  className={project.projectTag === null ? "project-name quiet" : "project-name"}
                >
                  {label}
                </span>
                <span className="figure project-money">{money}</span>
                <span className="project-bar">
                  <DotBar
                    fraction={share}
                    tone="share"
                    label={`${label}: ${money}, ${formatPercent(share)} of project spend`}
                  />
                </span>
                <span className="project-detail">
                  {`${project.requests} ${project.requests === 1 ? "request" : "requests"}, ${project.blockedRequests} blocked`}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {!anyTagged && (
        <p className="quiet">
          No tagged requests this week. Send x-project on gateway requests to see spend by project.
        </p>
      )}
    </section>
  );
}
