/**
 * The admin key check. v1 has one admin key from ADMIN_KEY, sent as `x-admin-key`; when the key
 * isn't configured, every admin request is rejected rather than let through.
 */

import { createMiddleware } from "hono/factory";

/**
 * Middleware that lets a request through only when its `x-admin-key` matches `adminKey`.
 *
 * @throws {UnauthorizedError} When the header is missing or wrong, or `adminKey` is undefined.
 */
export function requireAdmin(adminKey: string | undefined) {
  return createMiddleware(async () => {
    throw new Error("not implemented");
  });
}
