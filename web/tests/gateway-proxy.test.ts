/**
 * The dev proxy adds the admin key, so it must forward only what the dashboard reads. Any page
 * the admin visits can send requests to localhost; a proxy that forwarded every method would let
 * it reissue keys or change budgets. A real Vite dev server proxies to a stub gateway here.
 */

import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { gatewayProxy } from "../vite.config";

type Received = { method: string | undefined; url: string | undefined; adminKey: unknown };

const ADMIN_KEY = "dev-admin-key";
const received: Received[] = [];
let gateway: Server;
let vite: ViteDevServer;
let viteUrl: string;

beforeAll(async () => {
  gateway = createHttpServer((req, res) => {
    received.push({ method: req.method, url: req.url, adminKey: req.headers["x-admin-key"] });
    res.setHeader("content-type", "application/json");
    res.end("{}");
  });
  await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  const gatewayPort = (gateway.address() as AddressInfo).port;

  vite = await createServer({
    configFile: false,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      host: "127.0.0.1",
      port: 0,
      ws: false,
      watch: null,
      proxy: gatewayProxy({ port: String(gatewayPort), adminKey: ADMIN_KEY }),
    },
  });
  await vite.listen();
  // listen() resolves once the server is bound, so the address is an AddressInfo here.
  const address = vite.httpServer?.address() as AddressInfo;
  viteUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await vite?.close();
  await new Promise((resolve) => gateway?.close(resolve));
});

beforeEach(() => {
  received.length = 0;
});

describe("the dev proxy", () => {
  it("forwards GET /api/admin/usage to the gateway with the admin key", async () => {
    const res = await fetch(`${viteUrl}/api/admin/usage`);
    expect(res.status).toBe(200);
    expect(received).toEqual([{ method: "GET", url: "/admin/usage", adminKey: ADMIN_KEY }]);
  });

  it.each([
    ["POST", "/api/admin/employees/sam/key"],
    ["PUT", "/api/admin/company/pool"],
    ["POST", "/api/admin/usage"],
    ["DELETE", "/api/admin/usage"],
    ["GET", "/api/admin/clock"],
    ["GET", "/api/openapi.json"],
  ])("answers %s %s with 404 and never reaches the gateway", async (method, path) => {
    const res = await fetch(`${viteUrl}${path}`, { method });
    expect(res.status).toBe(404);
    expect(received).toEqual([]);
  });
});
