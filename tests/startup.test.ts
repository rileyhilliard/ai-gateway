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

/**
 * Runs main.ts on a free port with `env` until it logs "listening", and returns its port and the
 * log records printed by then.
 */
function startMain(env: Record<string, string>): Promise<{ port: number; logs: LogLine[] }> {
  return new Promise((resolve, reject) => {
    const started = spawn(process.execPath, [MAIN], {
      env: { PATH: process.env.PATH ?? "", LOG_LEVEL: "info", PORT_API: "0", ...env },
      stdio: ["ignore", "pipe", "ignore"],
    });
    child = started;
    const logs: LogLine[] = [];
    let buffered = "";
    started.stdout?.setEncoding("utf8").on("data", (text: string) => {
      buffered += text;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        const record = JSON.parse(line) as LogLine;
        logs.push(record);
        if (record.msg === "listening") resolve({ port: Number(record.port), logs });
      }
    });
    started.on("error", reject);
    started.on("exit", (code) => reject(new Error(`main.ts exited with ${code} before listening`)));
  });
}

type LogLine = { level: number; msg: string; port?: number };

const fakeMessage = (port: number) =>
  fetch(`http://127.0.0.1:${port}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "key-staff" },
    body: JSON.stringify({ model: "fake/model", max_tokens: 8, messages: [] }),
  });

it("turns fake/ models off under NODE_ENV=production, so they're unknown models", async () => {
  const { port, logs } = await startMain({ NODE_ENV: "production" });
  const res = await fakeMessage(port);
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("unknown_model");
  expect(logs.map((record) => record.msg)).not.toContainEqual(expect.stringMatching(/fake\//));
});

it("serves fake/ models by default and says so at startup", async () => {
  const { port, logs } = await startMain({});
  expect((await fakeMessage(port)).status).toBe(200);
  expect(logs.map((record) => record.msg)).toContainEqual(
    expect.stringMatching(/^fake\/ models are enabled/),
  );
});

it("exits 1 with a one-line reason when the port is already taken", async () => {
  blocker = await startServer(testApp().app, 0);

  const { code, stderr } = await runMain({ PORT_API: String(blocker.port) });

  expect(code).toBe(1);
  expect(stderr.trim()).toBe(
    `Port ${blocker.port} is already in use. Stop whatever is listening there, or set PORT_API to a free port.`,
  );
});
