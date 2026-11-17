import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// The gateway's .env lives at the repo root, one level up.
const REPO_ROOT = resolve(import.meta.dirname, "..");

// The only request the dashboard makes. Every other /api request stops at the dev server.
const PROXIED_METHOD = "GET";
const PROXIED_PATH = "/api/admin/usage";

/**
 * The dev proxy to the gateway: GET /api/admin/usage goes to http://localhost:${PORT_API:-3000}
 * as GET /admin/usage, with the x-admin-key header added from the root .env's ADMIN_KEY. The key
 * stays in this dev server process; it is never a VITE_ variable, so it can't reach the browser
 * bundle.
 *
 * Anything else under /api gets a 404 from the dev server and never reaches the gateway. Any
 * site the admin visits can send requests to localhost (a no-cors POST needs no preflight), and
 * the proxy would add the key to them, so forwarding every method would let that site reissue
 * keys or change budgets.
 */
export function gatewayProxy({ port, adminKey }: { port: string; adminKey: string | undefined }) {
  return {
    "/api": {
      target: `http://localhost:${port}`,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      headers: adminKey ? { "x-admin-key": adminKey } : {},
      // Vite answers 404 itself when bypass returns false, and proxies when it returns undefined.
      bypass: (req: { method?: string; url?: string }) =>
        isDashboardRequest(req) ? undefined : false,
    },
  };
}

/** Whether a request is the dashboard's usage read. URL parsing resolves `..` segments first. */
function isDashboardRequest({ method, url = "" }: { method?: string; url?: string }): boolean {
  const { pathname } = new URL(url, "http://localhost");
  return method === PROXIED_METHOD && pathname === PROXIED_PATH;
}

/** The gateway's port and admin key from the root .env, as `bun dev` starts the gateway. */
function gatewayFromEnv(mode: string) {
  // Prefix "" loads every variable, and the shell's environment wins over the .env files.
  const env = loadEnv(mode, REPO_ROOT, "");
  return { port: env.PORT_API || env.PORT || "3000", adminKey: env.ADMIN_KEY };
}

// One config for `vite` (dev, build, preview) and Vitest (the `test` block), so tests compile the
// app exactly as the build does.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { proxy: gatewayProxy(gatewayFromEnv(mode)) },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          environment: "happy-dom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup.ts"],
        },
      },
      {
        extends: true,
        test: { name: "node", environment: "node", include: ["tests/**/*.test.ts"] },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.*", "src/main.tsx"],
    },
  },
}));
