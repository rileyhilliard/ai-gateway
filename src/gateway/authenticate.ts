/**
 * Rule 1 of the budget decision: turns the request's gateway key into an active employee. It
 * runs before body validation, so a bad key is a 401 whatever the body holds.
 */

import type { Employee } from "../budget/types.ts";
import { UnauthorizedError } from "../errors.ts";
import type { Store } from "../store/types.ts";

/**
 * The active employee holding `apiKey`.
 *
 * @throws {UnauthorizedError} When the key is missing, unknown or revoked, or the employee is
 * disabled.
 */
export async function authenticate(store: Store, apiKey: string | undefined): Promise<Employee> {
  if (!apiKey) throw new UnauthorizedError();
  const employee = await store.findEmployeeByKey(apiKey);
  // Unknown and disabled look the same to the caller, so the 401 doesn't reveal which keys exist.
  if (!employee || employee.disabled) throw new UnauthorizedError();
  return employee;
}
