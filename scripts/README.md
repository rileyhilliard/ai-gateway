# Development scripts

[dev.ts](dev.ts) is `bun run dev`: it checks the gateway's port is free ([dev-port.ts](dev-port.ts)), then starts the gateway (`bun run dev:api`) and the dashboard's Vite dev server (`web/`) together and opens the browser. Ctrl-C stops both, and if either exits the other is stopped too. `../tests/dev-port.test.ts` covers the port check.

[prepare.ts](prepare.ts) runs during dependency installation. It installs lefthook hooks only when `lefthook.yml` exists outside CI; this repo has none, so it does nothing. An unavailable installer is reported without failing `bun install`.

The package scripts invoke these files from the project root.
