/**
 * Exercises the real app through app.request to check the public HTTP contract shared by every
 * route: health, the OpenAPI document, request ids, error envelopes and request logging.
 * Messages-specific behavior lives in gateway-http.test.ts.
 */

import { describe, expect, it } from "vitest";
import { ErrorEnvelope, errorTable } from "../src/errors.ts";
import { AnthropicErrorBody } from "../src/gateway/anthropic-errors.ts";
import type { Store } from "../src/store/types.ts";
import { jsonBody, testApp, testGateway } from "./helpers/app.ts";

const message = {
  model: "fake/model",
  max_tokens: 64,
  messages: [{ role: "user", content: "hi" }],
};
const withKey = { "x-api-key": "key-staff" };

/** Checks a `/v1/*` error: Anthropic's shape, with the gateway's code and the table's message. */
async function expectAnthropicError(
  res: Response,
  code: keyof typeof errorTable,
  { message = errorTable[code].message as string } = {},
) {
  expect(res.status).toBe(errorTable[code].status);
  expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  const body = AnthropicErrorBody.parse(await res.json());
  expect(body.error.code).toBe(code);
  expect(body.error.message).toBe(message);
  expect(body.request_id).toBe(res.headers.get("x-request-id"));
  return body;
}

async function expectEnvelope(res: Response, code: keyof typeof errorTable) {
  expect(res.status).toBe(errorTable[code].status);
  expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  const body = ErrorEnvelope.parse(await res.json());
  expect(body.error.code).toBe(code);
  expect(body.error.message).toBe(errorTable[code].message);
  expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
  return body;
}

describe("health and the OpenAPI document", () => {
  it("GET /healthz answers ok with a request id", async () => {
    const { app, requests } = testApp();
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("x-request-id")).toMatch(/^[\w=-]+$/);
    expect(requests()).toMatchObject([{ level: "debug", route: "/healthz", status: 200 }]);
  });

  it("GET /openapi.json documents every route and the error envelope", async () => {
    const { app } = testApp();
    const doc = (await (await app.request("/openapi.json")).json()) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/admin",
      "/admin/company/pool",
      "/admin/employees/{id}/key",
      "/admin/employees/{id}/overrides",
      "/admin/employees/{id}/tier",
      "/admin/usage",
      "/healthz",
      "/v1/messages",
    ]);
    expect(Object.keys(doc.paths["/v1/messages"] ?? {})).toEqual(["post"]);
    expect(doc.components.schemas).toHaveProperty("Error");
  });

  it("keeps a supplied safe request id and replaces an unsafe one", async () => {
    const { app } = testApp();
    const kept = await app.request("/healthz", { headers: { "x-request-id": "abc-123" } });
    expect(kept.headers.get("x-request-id")).toBe("abc-123");
    const replaced = await app.request("/healthz", {
      headers: { "x-request-id": 'evil" level=fatal' },
    });
    expect(replaced.headers.get("x-request-id")).toMatch(/^[\w=-]+$/);
  });
});

describe("errors", () => {
  it("malformed JSON from a valid key is a 400 in Anthropic's shape", async () => {
    const { app } = testApp();
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", ...withKey },
      body: "{not json",
    });
    await expectAnthropicError(res, "bad_request");
  });

  it("a body that isn't JSON is a 415 in Anthropic's shape", async () => {
    const { app } = testApp();
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "text/plain", ...withKey },
      body: "model=fake/model",
    });
    await expectAnthropicError(res, "unsupported_media_type");
  });

  it("a body over the limit is a 413 in Anthropic's shape", async () => {
    const { app } = testApp({ maxBodyBytes: 64 });
    const res = await app.request(
      "/v1/messages",
      jsonBody({ ...message, pad: "x".repeat(200) }, withKey),
    );
    const body = await expectAnthropicError(res, "payload_too_large", {
      message: "Request body is over the 64-byte limit.",
    });
    expect(body.error.type).toBe("request_too_large");
  });

  it.each([
    ["an unknown path", "GET", "/nope", expectEnvelope],
    ["an unknown admin path", "GET", "/admin/nope", expectEnvelope],
    ["a wrong method on a /v1 path", "GET", "/v1/messages", expectAnthropicError],
    ["an unknown /v1 path", "POST", "/v1/complete", expectAnthropicError],
  ])("%s is a 404 with one request record", async (_, method, path, expectError) => {
    const { app, requests } = testApp();
    const res = await app.request(path, { method });
    await expectError(res, "not_found");
    expect(requests()).toHaveLength(1);
    expect(requests()[0]).toMatchObject({ status: 404 });
  });

  it("a thrown defect is a generic 500; the log has its class, not its message", async () => {
    const unused = () => Promise.reject(new Error("unused"));
    const failing: Store = {
      getCompany: unused,
      getTier: unused,
      listTiers: unused,
      listEmployees: unused,
      setWeeklyPool: unused,
      getEmployee: unused,
      updateEmployee: unused,
      findEmployeeByKey: () => Promise.reject(new TypeError("db password=hunter2")),
      listUsageSince: unused,
      addUsage: unused,
    };
    const { app, records } = testApp({ gateway: testGateway({ store: failing }) });
    const res = await app.request("/v1/messages", jsonBody(message, withKey));
    const envelope = await expectAnthropicError(res, "internal");
    expect(JSON.stringify(envelope)).not.toContain("hunter2");
    const logged = records.find((record) => record.msg === "unhandled error");
    expect(logged).toMatchObject({ errorClass: "TypeError", requestId: envelope.request_id });
    expect(JSON.stringify(records)).not.toContain("hunter2");
  });
});
