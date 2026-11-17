/**
 * Starts the API from environment configuration and handles process signals. It reads the seed
 * file, wires the store, upstreams and clock into the platform-free app, connects it to the Node
 * server, and coordinates shutdown logging and deadlines.
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createApp } from "./app.ts";
import { DEFAULT_PRICES } from "./budget/pricing.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { createLogger } from "./logging.ts";
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
  if (!(error instanceof SeedError || error instanceof SyntaxError || isFileError(error)))
    throw error;
  process.stderr.write(`Can't load seed ${config.seedPath}: ${error.message}\n`);
  process.exit(1);
}

const logger = createLogger(config.logLevel);
if (!config.adminKey) {
  logger.warn("ADMIN_KEY is not set, so every admin request will get 401");
}
const gateway = {
  store: createMemoryStore(seed),
  upstreams: {
    fake: createFakeUpstream(),
    openrouter: createOpenRouterUpstream({ apiKey: config.openRouterKey, fetch }),
  },
  prices: DEFAULT_PRICES,
  clock: () => new Date(),
  newId: randomUUID,
};
const server = await startServer(createApp({ config, logger, gateway }), config.port);
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
        logger.error({ errorClass: (error as Error).constructor.name }, "close failed");
        process.exit(1);
      },
    );
  });
}

/** A missing or unreadable seed file: Node's fs errors carry a string `code` such as ENOENT. */
function isFileError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
