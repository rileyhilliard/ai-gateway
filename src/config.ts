/**
 * Validates environment settings: port, log level, request-body limit, the seed file, the
 * OpenRouter key, the admin key and the demo clock switch. The process entry loads these values
 * before building the app, and exits naming any bad variable.
 */

import { z } from "@hono/zod-openapi";
import { LOG_LEVELS, type LogLevel } from "./logging.ts";

export type AppConfig = {
  port: number;
  logLevel: LogLevel;
  /** Requests with a larger body get the 413 envelope. */
  maxBodyBytes: number;
  /** Path of the seed JSON, relative to the working directory. */
  seedPath: string;
  /** Without it the app still starts; requests for real models get the 502 envelope. */
  openRouterKey: string | undefined;
  /** Without it the app still starts; every admin request gets the 401 envelope. */
  adminKey: string | undefined;
  /** When on, POST /admin/clock/advance moves the gateway's clock forward. Never for production. */
  demoClock: boolean;
};

export class ConfigError extends Error {
  override name = "ConfigError";
}

// An empty value in .env means "use the default", the same as leaving the line out.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const Port = z.coerce.number().int().min(0).max(65_535);

const Env = z.object({
  PORT_API: optional(Port),
  PORT: optional(Port),
  LOG_LEVEL: optional(
    z.preprocess(
      (value) => (typeof value === "string" ? value.toLowerCase() : value),
      z.enum(LOG_LEVELS),
    ),
  ),
  MAX_BODY_BYTES: optional(z.coerce.number().int().positive()),
  SEED_PATH: optional(z.string()),
  OPENROUTER_KEY: optional(z.string()),
  // A short or blank key would be easy to guess, so it fails at startup instead.
  ADMIN_KEY: optional(z.string().trim().min(8)),
  DEMO_CLOCK: optional(z.enum(["0", "1"])),
});

/** Parses settings from an environment record. Throws ConfigError naming each bad variable. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const { data } = parsed;
  return {
    port: data.PORT_API ?? data.PORT ?? 3000,
    logLevel: data.LOG_LEVEL ?? "info",
    maxBodyBytes: data.MAX_BODY_BYTES ?? 65_536,
    seedPath: data.SEED_PATH ?? "seed/company.json",
    openRouterKey: data.OPENROUTER_KEY,
    adminKey: data.ADMIN_KEY,
    demoClock: data.DEMO_CLOCK === "1",
  };
}
