/**
 * Declares POST /v1/messages, the Anthropic Messages endpoint employees call. It authenticates
 * the key before the body is validated, then hands the request to the gateway service and
 * passes the upstream's response through unchanged: JSON, or server-sent events for a
 * `stream: true` request.
 */

import { createRoute, z } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import type { Employee } from "../budget/types.ts";
import { describeCause, describeFailure, type Logger } from "../logging.ts";
import { createRouter } from "../router.ts";
import { anthropicErrorResponse } from "./anthropic-errors.ts";
import { authenticate } from "./authenticate.ts";
import { type GatewayDeps, handleMessage, type StreamSettlement } from "./service.ts";

// Loose, because every other Messages field (messages, max_tokens, system, tools) is forwarded
// to the provider as sent. The gateway itself only needs the model.
const MessagesRequest = z.looseObject({ model: z.string().min(1) }).openapi("MessagesRequest");

const json = <T>(schema: T) => ({ "application/json": { schema } });

/** Resolves the employee before the body validator runs, so rule 1 comes first. */
const requireEmployee = (store: GatewayDeps["store"]) =>
  createMiddleware<{ Variables: { employee: Employee } }>(async (c, next) => {
    c.set("employee", await authenticate(store, c.req.header("x-api-key")));
    await next();
  });

/**
 * The messages router, bound to the gateway's dependencies. `logger` reports a streamed
 * request's usage that couldn't be recorded, since no error handler sees it by then.
 */
export function messagesRoutes(deps: GatewayDeps, logger: Logger) {
  const messages = createRoute({
    method: "post",
    path: "/v1/messages",
    operationId: "createMessage",
    middleware: [requireEmployee(deps.store)] as const,
    request: { body: { content: json(MessagesRequest), required: true } },
    responses: {
      // No content schema: the body is whatever the provider sent, error statuses included. Leaving
      // it out also lets the handler return the provider's response as a plain Response.
      200: { description: "The provider's response, passed through unchanged" },
      400: anthropicErrorResponse("Invalid body or a model the gateway doesn't accept"),
      401: anthropicErrorResponse("Missing, unknown or revoked key, or a disabled employee"),
      429: anthropicErrorResponse("A budget limit blocked the request"),
      502: anthropicErrorResponse("The inference provider couldn't be reached"),
    },
  });

  return createRouter().openapi(messages, async (c) => {
    const upstream = await handleMessage(deps, {
      employee: c.get("employee"),
      body: c.req.valid("json"),
      headers: c.req.header(),
    });
    // A raw Response skips the headers middleware set on the context, so the request id the
    // client quotes to an admin is added by hand.
    const requestId = c.get("requestId");
    if (upstream.kind === "stream") {
      // The response has started by the time the stream settles, so what went wrong can only be
      // logged. `settled` never rejects.
      void upstream.settled.then((settlement) => logSettlement(logger, requestId, settlement));
      return new Response(upstream.events, {
        status: upstream.status,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "x-request-id": requestId,
        },
      });
    }
    // The provider's status (including its own errors such as 529) and body go back as they came.
    const isText = typeof upstream.body === "string";
    return new Response(isText ? String(upstream.body) : JSON.stringify(upstream.body), {
      status: upstream.status,
      headers: {
        "content-type": isText ? "text/plain; charset=utf-8" : "application/json",
        "x-request-id": requestId,
      },
    });
  });
}

/**
 * Logs what went wrong with a finished stream, once each: a provider drop as a warning (the
 * client got an error event and can retry), and a lost charge as an error with the whole record,
 * so it can be added back by hand.
 */
function logSettlement(logger: Logger, requestId: string, { end, recording }: StreamSettlement) {
  if (end.kind === "dropped") {
    logger.warn({ requestId, cause: describeCause(end.cause) }, "upstream stream dropped");
  }
  if (recording.kind === "failed") {
    logger.error(
      { requestId, record: recording.record, ...describeFailure(recording.cause) },
      "usage not recorded",
    );
  }
}
