/**
 * One authenticated messages request end to end: check the model has a price, decide the
 * budget, forward to the chosen upstream, and record the usage. HTTP lives in the route.
 */

import { decide } from "../budget/decide.ts";
import { weekStart } from "../budget/periods.ts";
import { costMicros, priceFor } from "../budget/pricing.ts";
import type {
  BlockDecision,
  Bucket,
  Clock,
  Employee,
  Micros,
  PriceTable,
  TokenUsage,
  UsageRecord,
} from "../budget/types.ts";
import { BudgetExceededError, UnknownModelError } from "../errors.ts";
import type { Store } from "../store/types.ts";
import { selectUpstream, type Upstreams } from "../upstream/select.ts";

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

// The employee's key and hop-by-hop headers stop here; the upstream adds its own credentials.
const HEADERS_NOT_FORWARDED = new Set([
  "x-api-key",
  "authorization",
  "host",
  "content-length",
  "connection",
]);

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
  const { store } = deps;
  const { employee, body } = request;
  // Taken once, before the upstream call, so a request that finishes after midnight still
  // counts toward the day it started.
  const startedAt = deps.clock();

  const price = priceFor(deps.prices, body.model);
  if (!price) throw new UnknownModelError();

  const tier = await store.getTier(employee.tierId);
  if (!tier) {
    throw new Error(`Employee ${employee.id} is in tier ${employee.tierId}, which doesn't exist.`);
  }
  const company = await store.getCompany();
  const usage = await store.listUsageSince(company.id, weekStart(startedAt));

  const decision = decide({ company, tier, employee, usage, now: startedAt });
  const base = { id: deps.newId(), employee, model: body.model, startedAt };
  if (decision.kind === "block") {
    await store.addUsage(blockedRecord(base, decision));
    throw new BudgetExceededError(decision);
  }

  const upstream = selectUpstream(body.model, deps.upstreams);
  const response = await upstream.send({ body, headers: forwardableHeaders(request.headers) });

  // No usage reported means nothing we can charge, even for a provider error.
  if (response.usage) {
    const cost = response.costMicros ?? costMicros(price, response.usage);
    await store.addUsage(allowedRecord(base, decision.bucket, response.usage, cost));
  }
  return { status: response.status, body: response.body };
}

type RecordBase = { id: string; employee: Employee; model: string; startedAt: Date };

function allowedRecord(
  base: RecordBase,
  bucket: Bucket,
  usage: TokenUsage,
  cost: Micros,
): UsageRecord {
  return {
    ...recordFields(base),
    status: "allowed",
    bucket,
    blockReason: null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costMicros: cost,
  };
}

function blockedRecord(base: RecordBase, decision: BlockDecision): UsageRecord {
  return {
    ...recordFields(base),
    status: "blocked",
    bucket: null,
    blockReason: decision.reason,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
  };
}

function recordFields(base: RecordBase) {
  return {
    id: base.id,
    companyId: base.employee.companyId,
    employeeId: base.employee.id,
    model: base.model,
    startedAt: base.startedAt,
    projectTag: null,
  };
}

function forwardableHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !HEADERS_NOT_FORWARDED.has(name.toLowerCase())),
  );
}
