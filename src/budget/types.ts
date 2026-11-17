/**
 * Shared domain types for budgets: companies, tiers, employees, usage records and the
 * allow-or-block decision. Every money amount is integer micro-dollars so sums and limit
 * comparisons are exact.
 */

/** Integer micro-dollars. $1 is 1_000_000. */
export type Micros = number;

/** The current time. Injected so tests and the demo can control resets. */
export type Clock = () => Date;

/** The one company in v1 and its weekly spend ceiling. */
export type Company = { id: string; name: string; weeklyPoolMicros: Micros };

/**
 * What happens once an employee's daily allowance is used up: block, or draw from the
 * company pool up to a weekly cap per employee (`null` means no personal cap).
 */
export type OverflowPolicy = { kind: "block" } | { kind: "pool"; weeklyCapMicros: Micros | null };

/**
 * A tier's daily allowance: a fixed amount, or a share of the company's weekly pool that is
 * resolved at each decision so it follows pool changes. The share is in basis points so it
 * stays an integer: 250 is 2.5%.
 */
export type DailyAllowance =
  | { kind: "fixed"; micros: Micros }
  | { kind: "percentOfPool"; basisPoints: number };

/** A spend group. Every employee belongs to exactly one. */
export type Tier = {
  id: string;
  name: string;
  dailyAllowance: DailyAllowance;
  overflow: OverflowPolicy;
};

/**
 * Per-employee replacements for the tier's numbers. A missing field means "use the tier's
 * value"; `poolCapMicros: null` means uncapped, which is different from missing.
 */
export type Overrides = { dailyAllowanceMicros?: Micros; poolCapMicros?: Micros | null };

/** A person with one active gateway key. */
export type Employee = {
  id: string;
  companyId: string;
  name: string;
  tierId: string;
  overrides: Overrides;
  apiKey: string;
  disabled: boolean;
};

/** Where an allowed request's cost is charged. */
export type Bucket = "personal" | "pool";

/** Why a request was blocked, matching rules 3 and 6 of the budget decision. */
export type BlockReason =
  | "company_pool_exhausted"
  | "personal_allowance_exhausted"
  | "pool_cap_reached";

/**
 * One request that passed the key check and reached a budget decision. Blocked records have
 * zero cost and a null bucket. `startedAt` is when the request arrived, which decides its
 * day and week.
 */
export type UsageRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  model: string;
  status: "allowed" | "blocked";
  bucket: Bucket | null;
  blockReason: BlockReason | null;
  inputTokens: number;
  outputTokens: number;
  costMicros: Micros;
  startedAt: Date;
  projectTag: string | null;
};

/** A blocked outcome, with what the 429 response reports. */
export type BlockDecision = {
  kind: "block";
  reason: BlockReason;
  spentMicros: Micros;
  limitMicros: Micros;
  resetsAt: Date;
};

/** The result of the budget rules for one request. */
export type Decision = { kind: "allow"; bucket: Bucket } | BlockDecision;

/** List price for one model, per million tokens. */
export type ModelPrice = { inputMicrosPerMTok: Micros; outputMicrosPerMTok: Micros };

/** Prices by OpenRouter model id. Also the allowlist of models the gateway accepts. */
export type PriceTable = Record<string, ModelPrice>;

/** Tokens a provider reported for one request. */
export type TokenUsage = { inputTokens: number; outputTokens: number };
