/**
 * The people table: everyone, highest cost first, with today's allowance use, this week's pool
 * draws against their cap, blocks, and a chip for anyone at their limit or disabled.
 */

import type { EmployeeUsage } from "../../api/usage";
import { DotBar } from "./dot-bar";
import { formatMoney, formatPercent } from "./money";
import { allowanceUsed, byCostThenName, type PersonStatus, personStatus } from "./people";

const STATUS_CHIPS: Record<Exclude<PersonStatus, "none">, { text: string; tone: string }> = {
  "at-limit": { text: "At limit", tone: "chip-waiting" },
  disabled: { text: "Disabled", tone: "chip-muted" },
};

/** The table of every employee in the report. */
export function PeopleTable(props: { employees: readonly EmployeeUsage[] }) {
  return (
    <section aria-labelledby="people-heading" className="panel">
      <h2 id="people-heading">People</h2>
      <div className="table-scroll">
        <table className="people-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Tier</th>
              <th scope="col">Cost this week</th>
              <th scope="col">Allowance used today</th>
              <th scope="col">Pool draws this week</th>
              <th scope="col">Blocked this week</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {byCostThenName(props.employees).map((person) => (
              <PersonRow key={person.employeeId} person={person} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PersonRow(props: { person: EmployeeUsage }) {
  const { person } = props;
  return (
    <tr>
      <th scope="row">{person.name}</th>
      <td className="mono">{person.tierId}</td>
      <td className="mono">{formatMoney(person.spentThisWeekMicros)}</td>
      <td>
        <AllowanceCell person={person} />
      </td>
      <td className="mono">{poolDrawsText(person)}</td>
      <td className="mono">{person.blockedThisWeek}</td>
      <td>
        <StatusChip status={personStatus(person)} />
      </td>
    </tr>
  );
}

function AllowanceCell(props: { person: EmployeeUsage }) {
  const { person } = props;
  const used = allowanceUsed(person);
  if (used.kind === "pool-only") return <span className="muted mono">pool only</span>;
  return (
    <div className="allowance-cell">
      <DotBar
        fraction={used.share}
        tone="usage"
        label={`${person.name} used ${formatPercent(used.share)} of today's allowance`}
      />
      <span className="mono">
        {`${formatMoney(person.spentTodayMicros)} / ${formatMoney(person.dailyAllowanceMicros)}`}
      </span>
    </div>
  );
}

function poolDrawsText(person: EmployeeUsage): string {
  if (person.overflow.kind === "block") return "blocks after allowance";
  const cap = person.overflow.weeklyCapMicros;
  const drawn = formatMoney(person.poolDrawsThisWeekMicros);
  return `${drawn} / ${cap === null ? "uncapped" : formatMoney(cap)}`;
}

function StatusChip(props: { status: PersonStatus }) {
  if (props.status === "none") return null;
  const chip = STATUS_CHIPS[props.status];
  return <span className={`chip ${chip.tone}`}>{chip.text}</span>;
}
