/**
 * The port check `bun dev` runs before starting anything. If the gateway's port is taken, the
 * gateway crashes under `node --watch` and waits for file changes, while Vite keeps proxying
 * /api to whatever holds the port, so the dashboard shows that server's errors (usually a 401
 * that looks like a bad ADMIN_KEY). Failing up front with the port's name avoids that.
 */

import { createServer } from "node:net";

const DEFAULT_API_PORT = 3000;

/**
 * The port the gateway will listen on: PORT_API, then PORT, then 3000. The same rule as
 * src/config.ts and web/vite.config.ts; an empty value counts as unset.
 */
export function apiPortFrom(env: Record<string, string | undefined>): number {
  const raw = env.PORT_API || env.PORT;
  return raw ? Number(raw) : DEFAULT_API_PORT;
}

/**
 * Whether nothing is listening on `port`, found by binding it the way the gateway will (every
 * interface) and letting go at once.
 *
 * @throws {Error} When binding fails for any reason other than the port being in use.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    probe.listen(port, () => probe.close(() => resolve(true)));
  });
}

/** What `bun dev` prints when the gateway's port is taken. */
export function portTakenMessage(port: number): string {
  return [
    `dev: Port ${port} is already in use, so the gateway can't start. Nothing was started.`,
    `Find what holds it with \`lsof -i :${port}\` and stop it, or set PORT_API in .env to a free port.`,
  ].join("\n");
}
