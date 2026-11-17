/**
 * The admin key check. v1 has one admin key from ADMIN_KEY, sent as `x-admin-key`; when the key
 * isn't configured, every admin request is rejected rather than let through.
 */

import { createMiddleware } from "hono/factory";
import { UnauthorizedError } from "../errors.ts";

/**
 * Middleware that lets a request through only when its `x-admin-key` matches `adminKey`.
 *
 * @throws {UnauthorizedError} When the header is missing or wrong, or `adminKey` is undefined.
 */
export function requireAdmin(adminKey: string | undefined) {
  return createMiddleware(async (c, next) => {
    // Checked first so an unset key can't be matched by a missing or empty header.
    if (!adminKey) throw new UnauthorizedError("admin");
    if (c.req.header("x-admin-key") !== adminKey) throw new UnauthorizedError("admin");
    await next();
  });
}
