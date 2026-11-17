/**
 * One authenticated messages request end to end: check the model has a price, decide the
 * budget, forward to the chosen upstream, and record the usage. HTTP lives in the route.
 */

import type { Clock, Employee, PriceTable } from "../budget/types.ts";
import type { Store } from "../store/types.ts";
import type { Upstreams } from "../upstream/select.ts";

/** What the gateway needs from the outside world. */
export type GatewayDeps = {
  store: Store;
  upstreams: Upstreams;
  prices: PriceTable;
  clock: Clock;
  newId: () => string;
};

/** An authenticated request: who sent it, the JSON body, and the incoming headers (lowercase). */
export type MessageRequest = {
  employee: Employee;
  body: { model: string } & Record<string, unknown>;
  headers: Record<string, string>;
};

/** The upstream's answer, passed through to the client unchanged. */
export type MessageResponse = { status: number; body: unknown };

/**
 * Handles one request after authentication.
 *
 * @throws {UnknownModelError} When the model has no price. Nothing is recorded.
 * @throws {BudgetExceededError} When a budget rule blocks the request. A blocked record is written.
 * @throws {UpstreamUnavailableError} When the upstream can't be reached. Nothing is recorded.
 * @throws {Error} When the employee's tier doesn't exist, which is a seed or programming error.
 */
export async function handleMessage(
  deps: GatewayDeps,
  request: MessageRequest,
): Promise<MessageResponse> {
  throw new Error("not implemented");
}
