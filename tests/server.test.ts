/**
 * Exercises the Node server over a real socket on an assigned free port. These tests cover
 * health, a messages request through the fake upstream, and closing the server.
 */

import { afterEach, expect, it } from "vitest";
import { type RunningServer, startServer } from "../src/server.ts";
import { jsonBody, testApp } from "./helpers/app.ts";

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

it("serves health and a messages request over HTTP", async () => {
  const { app } = testApp();
  server = await startServer(app, 0);
  const base = `http://127.0.0.1:${server.port}`;

  const health = await fetch(`${base}/healthz`);
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });

  const body = { model: "fake/model", max_tokens: 64, messages: [{ role: "user", content: "hi" }] };
  const reply = await fetch(`${base}/v1/messages`, jsonBody(body, { "x-api-key": "key-staff" }));
  expect(reply.status).toBe(200);
  expect(await reply.json()).toMatchObject({ type: "message", content: [{ text: "Fake reply." }] });
});

it("close() stops the server", async () => {
  const { app } = testApp();
  const running = await startServer(app, 0);
  await running.close();
  await expect(fetch(`http://127.0.0.1:${running.port}/healthz`)).rejects.toThrow();
});
