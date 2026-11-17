/**
 * The port check `bun dev` runs before it starts anything: which port the gateway will use, and
 * whether something already holds it. A taken port used to leave the dashboard proxying to a
 * stranger's server while the gateway sat crashed under `node --watch`.
 */

import { afterEach, describe, expect, it } from "vitest";
import { apiPortFrom, isPortFree, portTakenMessage } from "../scripts/dev-port.ts";
import { type RunningServer, startServer } from "../src/server.ts";
import { testApp } from "./helpers/app.ts";

let held: RunningServer | undefined;
afterEach(async () => {
  await held?.close();
  held = undefined;
});

describe("which port the gateway will use", () => {
  it("reads PORT_API first, then PORT, then defaults to 3000, like the dev proxy", () => {
    expect(apiPortFrom({ PORT_API: "3001", PORT: "4000" })).toBe(3001);
    expect(apiPortFrom({ PORT: "4000" })).toBe(4000);
    expect(apiPortFrom({ PORT_API: "", PORT: "" })).toBe(3000);
    expect(apiPortFrom({})).toBe(3000);
  });
});

describe("whether the port is free", () => {
  it("reports a port another server is listening on as taken, and free once it closes", async () => {
    held = await startServer(testApp().app, 0);
    const { port } = held;

    expect(await isPortFree(port)).toBe(false);

    await held.close();
    held = undefined;
    expect(await isPortFree(port)).toBe(true);
  });

  it("names the port and how to free it", () => {
    const message = portTakenMessage(3001);
    expect(message).toContain("Port 3001 is already in use");
    expect(message).toContain("lsof -i :3001");
    expect(message).toContain("PORT_API");
  });
});
