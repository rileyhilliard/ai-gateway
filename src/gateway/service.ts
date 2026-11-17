/**
 * One authenticated messages request end to end: check the model has a price, decide the
 * budget, forward to the chosen upstream, and record the usage (for a stream, once it ends).
 * HTTP and logging live in the route.
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
import { BadRequestError, BudgetExceededError, UnknownModelError } from "../errors.ts";
import type { Store } from "../store/types.ts";
import { selectUpstream, type Upstreams } from "../upstream/select.ts";
import {
  isUpstreamStream,
  type Upstream,
  type UpstreamResponse,
  type UpstreamStream,
} from "../upstream/types.ts";
import { type ReportedUsage, watchStreamUsage } from "./stream-usage.ts";

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

/**
 * The upstream's answer, passed through to the client unchanged. A stream is charged when it
 * ends, after the response has started, so `usageRecorded` settles then; it rejects only when
 * the store couldn't write the record.
 */
export type MessageResponse =
  | { kind: "json"; status: number; body: unknown }
  | {
      kind: "stream";
      status: number;
      events: ReadableStream<Uint8Array>;
      usageRecorded: Promise<void>;
    };

// The employee's key and hop-by-hop headers stop here; the upstream adds its own credentials.
const HEADERS_NOT_FORWARDED = new Set([
  "x-api-key",
  "authorization",
  "host",
  "content-length",
  "connection",
  "x-project",
]);
const MAX_PROJECT_TAG_LENGTH = 64;

/**
 * Handles one request after authentication.
 *
 * @throws {BadRequestError} When the x-project tag is too long. Nothing is recorded.
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
  const projectTag = projectTagOf(request.headers);

  const price = priceFor(deps.prices, body.model);
  if (!price) throw new UnknownModelError(body.model, Object.keys(deps.prices));

  const tier = await store.getTier(employee.tierId);
  if (!tier) {
    throw new Error(`Employee ${employee.id} is in tier ${employee.tierId}, which doesn't exist.`);
  }
  const company = await store.getCompany();
  const usage = await store.listUsageSince(company.id, weekStart(startedAt));

  const decision = decide({ company, tier, employee, usage, now: startedAt });
  const base = { id: deps.newId(), employee, model: body.model, startedAt, projectTag };
  if (decision.kind === "block") {
    await store.addUsage(blockedRecord(base, decision));
    throw new BudgetExceededError(decision);
  }

  const response = await forward(selectUpstream(body.model, deps.upstreams), request);

  // No usage reported means nothing we can charge, even for a provider error.
  const charge = async (reported: ReportedUsage | null) => {
    if (!reported) return;
    const cost = reported.costMicros ?? costMicros(price, reported.usage);
    await store.addUsage(allowedRecord(base, decision.bucket, reported.usage, cost));
  };

  if (isUpstreamStream(response)) {
    const { events, ended } = watchStreamUsage(response.events);
    return { kind: "stream", status: response.status, events, usageRecorded: ended.then(charge) };
  }
  await charge(response.usage ? { usage: response.usage, costMicros: response.costMicros } : null);
  return { kind: "json", status: response.status, body: response.body };
}

/** Sends the request, streaming when the client asked to and the upstream can. */
function forward(
  upstream: Upstream,
  request: MessageRequest,
): Promise<UpstreamResponse | UpstreamStream> {
  const upstreamRequest = { body: request.body, headers: forwardableHeaders(request.headers) };
  if (request.body.stream === true && upstream.stream) return upstream.stream(upstreamRequest);
  return upstream.send(upstreamRequest);
}

type RecordBase = {
  id: string;
  employee: Employee;
  model: string;
  startedAt: Date;
  projectTag: string | null;
};

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
    projectTag: base.projectTag,
  };
}

/**
 * The request's project from the `x-project` header, trimmed. Blank or missing means no project.
 *
 * @throws {BadRequestError} When the tag is longer than 64 characters.
 */
function projectTagOf(headers: Record<string, string>): string | null {
  const tag = headers["x-project"]?.trim() ?? "";
  if (tag === "") return null;
  if (tag.length > MAX_PROJECT_TAG_LENGTH) {
    throw new BadRequestError([
      {
        path: "header.x-project",
        message: `Project tag is ${tag.length} characters; the limit is ${MAX_PROJECT_TAG_LENGTH}. Use a shorter name.`,
      },
    ]);
  }
  return tag;
}

function forwardableHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !HEADERS_NOT_FORWARDED.has(name.toLowerCase())),
  );
}
