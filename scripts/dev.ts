#!/usr/bin/env bun
/**
 * `bun dev`: runs the gateway (`bun run dev:api`) and the dashboard's Vite dev server together,
 * opening the dashboard in the browser. It first checks the gateway's port is free and starts
 * nothing if it isn't. Ctrl-C stops both, and if either one exits the other is stopped too, so a
 * crashed gateway never leaves an orphaned dev server (or the reverse).
 */

import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { apiPortFrom, isPortFree, portTakenMessage } from "./dev-port.ts";

const ROOT = join(import.meta.dirname, "..");

type Service = { name: string; child: ChildProcess };

// Bun loads the root .env into process.env before this runs, so PORT_API there counts.
const apiPort = apiPortFrom(process.env);
if (!(await isPortFree(apiPort))) {
  console.error(portTakenMessage(apiPort));
  process.exit(1);
}

const services: Service[] = [
  start("api", ["run", "dev:api"], ROOT),
  start("web", ["run", "dev", "--open"], join(ROOT, "web")),
];
let stopping = false;
let shutdownExitCode = 0;

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => stopAll(signal, 130));
}
for (const service of services) {
  service.child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `dev: ${service.name} exited (${signal ?? `code ${code}`}); stopping the rest.`,
      );
    }
    stopAll("SIGTERM", code ?? 1);
  });
}

/**
 * Starts one `bun` command in its own process group. A group lets one signal reach the whole
 * pipeline (`node | pino-pretty`). stdin is closed because a background group reading the
 * terminal would be stopped by SIGTTIN.
 */
function start(name: string, args: string[], cwd: string): Service {
  const child = spawn("bun", args, {
    cwd,
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("error", (error) => {
    console.error(`dev: couldn't start ${name} (bun ${args.join(" ")}): ${error.message}`);
    stopAll("SIGTERM", 1);
  });
  return { name, child };
}

/**
 * Signals every still-running service's group, then exits once they have all gone. The exit
 * code is the one from what started the shutdown (Ctrl-C, or the first service to exit).
 */
function stopAll(signal: NodeJS.Signals, exitCode: number): void {
  if (!stopping) {
    stopping = true;
    shutdownExitCode = exitCode;
    for (const { child } of services) signalGroup(child, signal);
  }
  if (services.every(({ child }) => hasExited(child))) process.exit(shutdownExitCode);
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || hasExited(child)) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    // ESRCH: the group exited between the check and the kill, which is what we wanted anyway.
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}
