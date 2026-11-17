/**
 * The people table, which is also the cost ranking: everyone, highest cost first, each cost with
 * a bar for its share of this week's spend, then today's allowance use, pool draws against the
 * cap, blocks, and a status for anyone at their limit or disabled.
 */

import type { EmployeeUsage } from "../../api/usage";
import { DotBar } from "./dot-bar";
import { formatMoney, formatPercent, ratioOf } from "./money";
import { allowanceUsed, byCostThenName, type PersonStatus, personStatus } from "./people";

const STATUS_TEXT: Record<Exclude<PersonStatus, "none">, string> = {
  "at-limit": "At limit",
  disabled: "Disabled",
};

/** The table of every employee in the report, ranked by what they cost this week. */
export function PeopleTable(props: {
  employees: readonly EmployeeUsage[];
  companySpentMicros: number;
}) {
  const nobodySpent = props.employees.every((person) => person.spentThisWeekMicros === 0);
  return (
    <section aria-labelledby="people-heading" className="section">
      <div className="section-head">
        <h2 id="people-heading">People</h2>
        <p className="section-note">Highest cost this week first</p>
      </div>
      {nobodySpent && <p className="quiet">Nobody has spent anything this week.</p>}
      <div className="table-scroll">
        <table className="people-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Tier</th>
              <th scope="col" className="num">
                Cost this week
              </th>
              <th scope="col" className="num">
                Allowance used today
              </th>
              <th scope="col" className="num">
                Pool draws this week
              </th>
              <th scope="col" className="num">
                Blocked
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {byCostThenName(props.employees).map((person) => (
              <PersonRow
                key={person.employeeId}
                person={person}
                companySpentMicros={props.companySpentMicros}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PersonRow(props: { person: EmployeeUsage; companySpentMicros: number }) {
  const { person } = props;
  return (
    <tr>
      <th scope="row">{person.name}</th>
      <td className="tier">{person.tierId}</td>
      <td className="num">
        <CostCell person={person} companySpentMicros={props.companySpentMicros} />
      </td>
      <td className="num">
        <AllowanceCell person={person} />
      </td>
      <td className="num">
        <PoolDrawsCell person={person} />
      </td>
      <td className={person.blockedThisWeek === 0 ? "num figure dim" : "num figure"}>
        {person.blockedThisWeek}
      </td>
      <td>
        <StatusMark status={personStatus(person)} />
      </td>
    </tr>
  );
}

function CostCell(props: { person: EmployeeUsage; companySpentMicros: number }) {
  const { person } = props;
  const money = formatMoney(person.spentThisWeekMicros);
  if (person.spentThisWeekMicros === 0) return <span className="figure dim">{money}</span>;
  const share = ratioOf(person.spentThisWeekMicros, props.companySpentMicros);
  return (
    <div className="bar-cell">
      <span className="figure">{money}</span>
      <span className="cell-bar">
        <DotBar
          fraction={share}
          cells={16}
          tone="share"
          label={`${person.name}: ${money}, ${formatPercent(share)} of this week's spend`}
        />
      </span>
      <span className="figure share">{formatPercent(share)}</span>
    </div>
  );
}

function AllowanceCell(props: { person: EmployeeUsage }) {
  const { person } = props;
  const used = allowanceUsed(person);
  if (used.kind === "pool-only") return <span className="quiet">pool only</span>;
  return (
    <div className="bar-cell">
      <span className="cell-bar">
        <DotBar
          fraction={used.share}
          cells={16}
          tone="usage"
          label={`${person.name} used ${formatPercent(used.share)} of today's allowance`}
        />
      </span>
      <span className="figure">
        {`${formatMoney(person.spentTodayMicros)} / ${formatMoney(person.dailyAllowanceMicros)}`}
      </span>
    </div>
  );
}

function PoolDrawsCell(props: { person: EmployeeUsage }) {
  const { person } = props;
  if (person.overflow.kind === "block") {
    // Block tiers never draw on the pool; a quiet mark keeps the column scannable.
    return (
      <span className="no-pool" title="Blocks after allowance">
        <span aria-hidden="true">–</span>
        <span className="visually-hidden">Blocks after allowance</span>
      </span>
    );
  }
  const cap = person.overflow.weeklyCapMicros;
  return (
    <span className="figure">
      {formatMoney(person.poolDrawsThisWeekMicros)}
      <span className="dim">{` / ${cap === null ? "uncapped" : formatMoney(cap)}`}</span>
    </span>
  );
}

function StatusMark(props: { status: PersonStatus }) {
  if (props.status === "none") return null;
  return (
    <span className={`status-mark status-${props.status}`}>
      <span aria-hidden="true" className="status-dot" />
      {STATUS_TEXT[props.status]}
    </span>
  );
}
