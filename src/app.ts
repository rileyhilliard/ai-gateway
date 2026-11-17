/**
 * Assembles the API's middleware, resource routes, OpenAPI document and error handlers. The
 * resulting fetch handler runs through the Node server or directly in HTTP contract tests.
 */

import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { budgetRoutes } from "./admin/budget-routes.ts";
import { clockRoutes } from "./admin/clock-route.ts";
import { adminRoutes } from "./admin/usage-route.ts";
import type { DemoClock } from "./clock/demo-clock.ts";
import type { AppConfig } from "./config.ts";
import { AppError, envelope, toAppError } from "./errors.ts";
import { toAnthropicError } from "./gateway/anthropic-errors.ts";
import { messagesRoutes } from "./gateway/messages-route.ts";
import type { GatewayDeps } from "./gateway/service.ts";
import { type Logger, requestLogger } from "./logging.ts";
import { type AppEnv, createRouter } from "./router.ts";
import { healthRoutes } from "./routes/health.ts";

const ANTHROPIC_PATH_PREFIX = "/v1/";

/**
 * Renders an error in the shape the path's clients expect: Anthropic's on `/v1/`, the app's
 * envelope elsewhere. Budget blocks also tell Anthropic SDKs not to retry them.
 */
function renderError(c: Context<AppEnv>, error: AppError): Response {
  const requestId = c.get("requestId");
  if (!c.req.path.startsWith(ANTHROPIC_PATH_PREFIX)) {
    return c.json(envelope(error, requestId), error.status);
  }
  if (error.code === "budget_exceeded") c.header("x-should-retry", "false");
  return c.json(toAnthropicError(error, requestId), error.status);
}

export type AppDeps = {
  config: Pick<AppConfig, "maxBodyBytes" | "adminKey">;
  logger: Logger;
  gateway: GatewayDeps;
  /** Present only when DEMO_CLOCK=1; it must be the clock `gateway.clock` reads. */
  demoClock?: DemoClock;
};

/**
 * The whole API as a fetch handler: no Node imports, so the same app serves through
 * src/server.ts on Node and runs in tests through app.request().
 */
export function createApp({ config, logger, gateway, demoClock }: AppDeps) {
  if (demoClock && gateway.clock !== demoClock.now) {
    // Advancing a clock the gateway doesn't read would make the demo silently do nothing.
    throw new Error("demoClock.now must be the clock the gateway reads (gateway.clock).");
  }
  const app = createRouter();

  app.use(requestId({ limitLength: 128 }));
  app.use(requestLogger(logger));
  app.use(
    bodyLimit({
      maxSize: config.maxBodyBytes,
      onError: () => {
        throw new AppError("payload_too_large", {
          message: `Request body is over the ${config.maxBodyBytes}-byte limit.`,
        });
      },
    }),
  );

  app.route("/", healthRoutes());
  app.route("/", messagesRoutes(gateway));
  app.route(
    "/",
    adminRoutes({ store: gateway.store, clock: gateway.clock, adminKey: config.adminKey }),
  );
  app.route(
    "/",
    budgetRoutes({
      store: gateway.store,
      adminKey: config.adminKey,
      // Keys come from the same generator as record ids: random UUIDs in production, so a
      // reissued key never collides with a live one and findEmployeeByKey's first match is the
      // only match. The store doesn't enforce unique keys itself.
      newApiKey: () => `key-${gateway.newId()}`,
    }),
  );
  if (demoClock) app.route("/", clockRoutes({ demoClock, adminKey: config.adminKey }));

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: { title: "API", version: "1" },
  });

  // A wrong method on a declared path is a miss too: Hono answers both with the 404 envelope.
  app.notFound((c) => renderError(c, new AppError("not_found")));

  app.onError((error, c) => {
    const appError = toAppError(error);
    if (appError.code === "internal") {
      // The class and stack go to the log; the message may hold secrets, so it stays out.
      logger.error(
        {
          requestId: c.get("requestId"),
          errorClass: error.constructor.name,
          stack: error.stack?.split("\n").slice(1).join("\n"),
        },
        "unhandled error",
      );
    }
    if (appError.code === "upstream_unavailable") {
      // A warning, since the client got a 502 it can retry; the cause says what to fix.
      logger.warn(
        { requestId: c.get("requestId"), cause: describeCause(appError.cause) },
        "upstream unavailable",
      );
    }
    return renderError(c, appError);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;

/** The class and message of an upstream failure's cause, for the log. */
function describeCause(cause: unknown): { errorClass: string; message: string } | undefined {
  if (!(cause instanceof Error)) return undefined;
  return { errorClass: cause.constructor.name, message: cause.message };
}
