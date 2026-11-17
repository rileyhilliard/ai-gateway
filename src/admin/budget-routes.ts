/**
 * The admin write API: set the company's weekly pool, move an employee to another tier, set or
 * clear their overrides, and revoke or reissue their gateway key. Inputs are in dollars and are
 * stored as micro-dollars; responses are in micro-dollars, like the usage view. Every route sits
 * behind the admin key, and each change applies from the next request on.
 */

import { createRoute, z } from "@hono/zod-openapi";
import { MAX_USD, usdToMicros } from "../budget/money.ts";
import type { Employee, Overrides } from "../budget/types.ts";
import { BadRequestError, errorResponse, NotFoundError } from "../errors.ts";
import { createRouter } from "../router.ts";
import type { EmployeeChanges, Store } from "../store/types.ts";
import { requireAdmin } from "./auth.ts";

/** What the budget admin routes need. `newApiKey` is the only source of new keys. */
export type BudgetAdminDeps = {
  store: Store;
  adminKey: string | undefined;
  newApiKey: () => string;
};

const micros = z.number().int();
const dollars = z.number().nonnegative().max(MAX_USD);

const EmployeeParams = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "ivy" }),
});

const PoolBody = z.object({ weeklyPoolUsd: dollars });
const TierBody = z.object({ tierId: z.string() });
const OverridesBody = z.object({
  dailyAllowanceUsd: dollars.optional(),
  poolCapUsd: dollars.nullable().optional(),
});

const CompanySchema = z
  .object({ id: z.string(), name: z.string(), weeklyPoolMicros: micros })
  .openapi("CompanyPool");

const EmployeeViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    tierId: z.string(),
    disabled: z.boolean(),
    overrides: z.object({
      dailyAllowanceMicros: micros.optional(),
      poolCapMicros: micros.nullable().optional(),
    }),
  })
  .openapi("EmployeeView");

const ReissuedKeySchema = z
  .object({ employeeId: z.string(), apiKey: z.string() })
  .openapi("ReissuedKey");

type EmployeeView = z.infer<typeof EmployeeViewSchema>;

const jsonBody = <T extends z.ZodType>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

const jsonResponse = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
});

const unauthorized = errorResponse("Missing or wrong admin key, or ADMIN_KEY isn't configured");
const invalidBody = errorResponse("The body failed validation; issues name each field");
const unknownEmployee = errorResponse("No employee has this id");

/** The budget admin router, bound to its dependencies. */
export function budgetRoutes(deps: BudgetAdminDeps) {
  const employeeView = (description: string) => jsonResponse(description, EmployeeViewSchema);

  const setPool = createRoute({
    method: "put",
    path: "/admin/company/pool",
    operationId: "setWeeklyPool",
    middleware: [requireAdmin(deps.adminKey)] as const,
    request: { body: jsonBody(PoolBody) },
    responses: {
      200: jsonResponse("The company with its new weekly pool", CompanySchema),
      400: invalidBody,
      401: unauthorized,
    },
  });

  const setTier = createRoute({
    method: "put",
    path: "/admin/employees/{id}/tier",
    operationId: "setEmployeeTier",
    middleware: [requireAdmin(deps.adminKey)] as const,
    request: { params: EmployeeParams, body: jsonBody(TierBody) },
    responses: {
      200: employeeView("The employee on their new tier"),
      400: errorResponse("The body failed validation, or no tier has this id"),
      401: unauthorized,
      404: unknownEmployee,
    },
  });

  const setOverrides = createRoute({
    method: "put",
    path: "/admin/employees/{id}/overrides",
    operationId: "setEmployeeOverrides",
    middleware: [requireAdmin(deps.adminKey)] as const,
    request: { params: EmployeeParams, body: jsonBody(OverridesBody) },
    responses: {
      200: employeeView("The employee with exactly the overrides sent"),
      400: invalidBody,
      401: unauthorized,
      404: unknownEmployee,
    },
  });

  const revokeKey = createRoute({
    method: "delete",
    path: "/admin/employees/{id}/key",
    operationId: "revokeEmployeeKey",
    middleware: [requireAdmin(deps.adminKey)] as const,
    request: { params: EmployeeParams },
    responses: {
      200: employeeView("The employee, now disabled"),
      401: unauthorized,
      404: unknownEmployee,
    },
  });

  const reissueKey = createRoute({
    method: "post",
    path: "/admin/employees/{id}/key",
    operationId: "reissueEmployeeKey",
    middleware: [requireAdmin(deps.adminKey)] as const,
    request: { params: EmployeeParams },
    responses: {
      200: jsonResponse(
        "The new key, shown only this once; the employee is re-enabled",
        ReissuedKeySchema,
      ),
      401: unauthorized,
      404: unknownEmployee,
    },
  });

  return createRouter()
    .openapi(setPool, async (c) => {
      const { weeklyPoolUsd } = c.req.valid("json");
      const company = await deps.store.setWeeklyPool(usdToMicros(weeklyPoolUsd));
      return c.json(
        { id: company.id, name: company.name, weeklyPoolMicros: company.weeklyPoolMicros },
        200,
      );
    })
    .openapi(setTier, async (c) => {
      const { id } = c.req.valid("param");
      const { tierId } = c.req.valid("json");
      await requireEmployee(deps.store, id);
      await requireTier(deps.store, tierId);
      return c.json(toView(await updateEmployee(deps.store, id, { tierId })), 200);
    })
    .openapi(setOverrides, async (c) => {
      const { id } = c.req.valid("param");
      const overrides = toOverrides(c.req.valid("json"));
      return c.json(toView(await updateEmployee(deps.store, id, { overrides })), 200);
    })
    .openapi(revokeKey, async (c) => {
      const { id } = c.req.valid("param");
      return c.json(toView(await updateEmployee(deps.store, id, { disabled: true })), 200);
    })
    .openapi(reissueKey, async (c) => {
      const { id } = c.req.valid("param");
      const changes = { apiKey: deps.newApiKey(), disabled: false };
      const employee = await updateEmployee(deps.store, id, changes);
      return c.json({ employeeId: employee.id, apiKey: employee.apiKey }, 200);
    });
}

/**
 * Builds the full override set from the request. Only fields present in the body appear, so an
 * absent field means "no override" and `poolCapUsd: null` means "uncapped".
 */
function toOverrides(body: z.infer<typeof OverridesBody>): Overrides {
  const overrides: Overrides = {};
  if (body.dailyAllowanceUsd !== undefined) {
    overrides.dailyAllowanceMicros = usdToMicros(body.dailyAllowanceUsd);
  }
  if (body.poolCapUsd !== undefined) {
    overrides.poolCapMicros = body.poolCapUsd === null ? null : usdToMicros(body.poolCapUsd);
  }
  return overrides;
}

/** The employee as admins see it. Fields are picked by name so the key and company never leak. */
function toView(employee: Employee): EmployeeView {
  return {
    id: employee.id,
    name: employee.name,
    tierId: employee.tierId,
    disabled: employee.disabled,
    overrides: employee.overrides,
  };
}

/**
 * Checks that an employee exists before a change that needs other validation first.
 *
 * @throws {NotFoundError} When no employee has this id.
 */
async function requireEmployee(store: Store, id: string): Promise<void> {
  if (!(await store.getEmployee(id))) throw new NotFoundError();
}

/**
 * Checks that a tier exists.
 *
 * @throws {BadRequestError} When no tier has this id, with an issue at `json.tierId`.
 */
async function requireTier(store: Store, tierId: string): Promise<void> {
  if (await store.getTier(tierId)) return;
  throw new BadRequestError([{ path: "json.tierId", message: `No tier has the id "${tierId}".` }]);
}

/**
 * Applies changes to an employee and returns the updated record.
 *
 * @throws {NotFoundError} When no employee has this id.
 */
async function updateEmployee(
  store: Store,
  id: string,
  changes: EmployeeChanges,
): Promise<Employee> {
  const employee = await store.updateEmployee(id, changes);
  if (!employee) throw new NotFoundError();
  return employee;
}
