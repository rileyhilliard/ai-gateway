import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// The gateway's .env lives at the repo root, one level up.
const REPO_ROOT = resolve(import.meta.dirname, "..");

/**
 * The dev proxy to the gateway: /api/* goes to http://localhost:${PORT_API:-3000} with the
 * x-admin-key header added from the root .env's ADMIN_KEY. The key stays in this dev server
 * process; it is never a VITE_ variable, so it can't reach the browser bundle.
 */
function gatewayProxy(mode: string) {
  // Prefix "" loads every variable, and the shell's environment wins over the .env files.
  const env = loadEnv(mode, REPO_ROOT, "");
  const port = env.PORT_API || env.PORT || "3000";
  const adminKey = env.ADMIN_KEY;
  return {
    "/api": {
      target: `http://localhost:${port}`,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
      headers: adminKey ? { "x-admin-key": adminKey } : {},
    },
  };
}

// One config for `vite` (dev, build, preview) and Vitest (the `test` block), so tests compile the
// app exactly as the build does.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { proxy: gatewayProxy(mode) },
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
