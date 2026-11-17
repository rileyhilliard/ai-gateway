/**
 * The HTML for GET /admin: a static page that asks for the admin key, fetches /admin/usage and
 * renders it as two tables. It predates the React dashboard in web/ and stays as the zero-build
 * view the gateway serves on its own.
 */

// Static on purpose: the page holds no data and no key, so it is safe to serve without auth.
// Every value from the JSON is written with textContent, never parsed as HTML.
export const USAGE_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Spend gateway usage</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; }
  table { border-collapse: collapse; margin-top: 1rem; }
  th, td { border: 1px solid #ccc; padding: 0.3rem 0.6rem; text-align: left; }
  .disabled { color: #999; }
  #status { color: #b00; }
</style>
</head>
<body>
<h1>Usage</h1>
<form id="keyForm">
  <label>Admin key <input id="key" type="password" autocomplete="off"></label>
  <button type="submit">Load usage</button>
</form>
<p id="status"></p>
<p id="company"></p>
<table hidden id="table">
  <thead><tr>
    <th>Employee</th><th>Tier</th><th>Today / allowance</th>
    <th>Pool draws / cap</th><th>Blocked this week</th>
  </tr></thead>
  <tbody id="rows"></tbody>
</table>
<table hidden id="projectTable">
  <thead><tr>
    <th>Project</th><th>Spent this week</th><th>Requests</th><th>Blocked this week</th>
  </tr></thead>
  <tbody id="projectRows"></tbody>
</table>
<script>
  const keyInput = document.getElementById("key");
  const status = document.getElementById("status");
  keyInput.value = sessionStorage.getItem("adminKey") || "";

  const dollars = (micros) => (micros / 1e6).toLocaleString("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6,
  });

  function poolColumn(row) {
    if (row.overflow.kind === "block") return "blocked after allowance";
    const cap = row.overflow.weeklyCapMicros;
    return dollars(row.poolDrawsThisWeekMicros) + " / " + (cap === null ? "uncapped" : dollars(cap));
  }

  function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
  }

  function render(report) {
    const company = report.company;
    document.getElementById("company").textContent =
      company.name + ": " + dollars(company.spentThisWeekMicros) + " / " +
      dollars(company.weeklyPoolMicros) + " pool this week. Day resets " +
      report.dayResetsAt + ", week resets " + report.weekResetsAt + ".";
    const rows = document.getElementById("rows");
    rows.replaceChildren();
    for (const row of report.employees) {
      const tr = document.createElement("tr");
      if (row.disabled) tr.className = "disabled";
      tr.append(
        cell(row.name + (row.disabled ? " (disabled)" : "")),
        cell(row.tierId),
        cell(dollars(row.spentTodayMicros) + " / " + dollars(row.dailyAllowanceMicros)),
        cell(poolColumn(row)),
        cell(String(row.blockedThisWeek)),
      );
      rows.append(tr);
    }
    document.getElementById("table").hidden = false;
    renderProjects(report.projects);
  }

  function renderProjects(projects) {
    const rows = document.getElementById("projectRows");
    rows.replaceChildren();
    for (const row of projects) {
      const tr = document.createElement("tr");
      tr.append(
        cell(row.projectTag === null ? "(no project)" : row.projectTag),
        cell(dollars(row.spentThisWeekMicros)),
        cell(String(row.requests)),
        cell(String(row.blockedRequests)),
      );
      rows.append(tr);
    }
    document.getElementById("projectTable").hidden = false;
  }

  async function load() {
    sessionStorage.setItem("adminKey", keyInput.value);
    status.textContent = "";
    const res = await fetch("/admin/usage", { headers: { "x-admin-key": keyInput.value } });
    if (res.status === 401) { status.textContent = "Admin key rejected, or ADMIN_KEY isn't set on the server."; return; }
    if (!res.ok) { status.textContent = "Couldn't load usage (HTTP " + res.status + ")."; return; }
    render(await res.json());
  }

  document.getElementById("keyForm").addEventListener("submit", (event) => {
    event.preventDefault();
    load().catch((error) => { status.textContent = "Couldn't load usage: " + error.message; });
  });
</script>
</body>
</html>
`;
