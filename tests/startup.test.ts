/**
 * Starts the real process entry (src/main.ts) as a child process and checks what an operator sees
 * when startup fails: a one-line reason on stderr and a non-zero exit, not a Node stack trace.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { type RunningServer, startServer } from "../src/server.ts";
import { testApp } from "./helpers/app.ts";

const MAIN = join(import.meta.dirname, "..", "src", "main.ts");

let child: ChildProcess | undefined;
let blocker: RunningServer | undefined;
afterEach(async () => {
  child?.kill("SIGKILL");
  child = undefined;
  await blocker?.close();
  blocker = undefined;
});

/** Runs main.ts with `env` (and nothing from the developer's shell or .env) until it exits. */
function runMain(env: Record<string, string>): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const started = spawn(process.execPath, [MAIN], {
      env: { PATH: process.env.PATH ?? "", LOG_LEVEL: "silent", ...env },
      stdio: ["ignore", "ignore", "pipe"],
    });
    child = started;
    let stderr = "";
    started.stderr?.setEncoding("utf8").on("data", (text: string) => {
      stderr += text;
    });
    started.on("error", reject);
    started.on("exit", (code) => resolve({ code, stderr }));
  });
}

it("exits 1 with a one-line reason when the port is already taken", async () => {
  blocker = await startServer(testApp().app, 0);

  const { code, stderr } = await runMain({ PORT_API: String(blocker.port) });

  expect(code).toBe(1);
  expect(stderr.trim()).toBe(
    `Port ${blocker.port} is already in use. Stop whatever is listening there, or set PORT_API to a free port.`,
  );
});
