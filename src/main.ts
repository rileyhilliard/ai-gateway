/**
 * Starts the API from environment configuration and handles process signals. It reads the seed
 * file, wires the store, upstreams and clock into the platform-free app, connects it to the Node
 * server, and coordinates shutdown logging and deadlines.
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createApp } from "./app.ts";
import { DEFAULT_PRICES } from "./budget/pricing.ts";
import { createDemoClock } from "./clock/demo-clock.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { createLogger, describeFailure } from "./logging.ts";
import { parseSeed, SeedError } from "./seed/load.ts";
import { startServer } from "./server.ts";
import { createMemoryStore } from "./store/memory.ts";
import { createFakeUpstream } from "./upstream/fake.ts";
import { createOpenRouterUpstream } from "./upstream/openrouter.ts";

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
}

let seed: ReturnType<typeof parseSeed>;
try {
  seed = parseSeed(JSON.parse(await readFile(config.seedPath, "utf8")));
} catch (error) {
  if (!(error instanceof SeedError || error instanceof SyntaxError || isSystemError(error)))
    throw error;
  process.stderr.write(`Can't load seed ${config.seedPath}: ${error.message}\n`);
  process.exit(1);
}

const logger = createLogger(config.logLevel);
if (!config.openRouterKey) {
  logger.warn("OPENROUTER_KEY is not set, so requests for non-fake models will get 502");
}
if (!config.adminKey) {
  logger.warn("ADMIN_KEY is not set, so every admin request will get 401");
}
const demoClock = config.demoClock ? createDemoClock(() => new Date()) : undefined;
if (demoClock) {
  logger.warn("DEMO_CLOCK is on: POST /admin/clock/advance moves budget time forward");
}
const gateway = {
  store: createMemoryStore(seed),
  upstreams: {
    fake: createFakeUpstream(),
    openrouter: createOpenRouterUpstream({ apiKey: config.openRouterKey, fetch }),
  },
  prices: DEFAULT_PRICES,
  clock: demoClock?.now ?? (() => new Date()),
  newId: randomUUID,
};
let server: Awaited<ReturnType<typeof startServer>>;
try {
  server = await startServer(createApp({ config, logger, gateway, demoClock }), config.port);
} catch (error) {
  if (!(isSystemError(error) && error.code === "EADDRINUSE")) throw error;
  process.stderr.write(
    `Port ${config.port} is already in use. Stop whatever is listening there, or set PORT_API to a free port.\n`,
  );
  process.exit(1);
}
logger.info({ port: server.port }, "listening");

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    // Open keep-alive connections get 10 s to finish before the process exits anyway.
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    server.close().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error(describeFailure(error), "close failed");
        process.exit(1);
      },
    );
  });
}

/**
 * A Node system error, which carries a string `code`: ENOENT for a missing seed file,
 * EADDRINUSE for a taken port.
 */
function isSystemError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
