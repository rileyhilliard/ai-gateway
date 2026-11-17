/**
 * Exercises the real app through app.request to check the public HTTP contract shared by every
 * route: health, the OpenAPI document, request ids, error envelopes and request logging.
 * Messages-specific behavior lives in gateway-http.test.ts.
 */

import { describe, expect, it } from "vitest";
import { ErrorEnvelope, errorTable } from "../src/errors.ts";
import type { Store } from "../src/store/types.ts";
import { jsonBody, testApp, testGateway } from "./helpers/app.ts";

const message = {
  model: "fake/model",
  max_tokens: 64,
  messages: [{ role: "user", content: "hi" }],
};
const withKey = { "x-api-key": "key-staff" };

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
    expect(Object.keys(doc.paths).sort()).toEqual(["/healthz", "/v1/messages"]);
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
  it("malformed JSON from a valid key is the 400 envelope", async () => {
    const { app } = testApp();
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", ...withKey },
      body: "{not json",
    });
    await expectEnvelope(res, "bad_request");
  });

  it("a body that isn't JSON is the 415 envelope", async () => {
    const { app } = testApp();
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "text/plain", ...withKey },
      body: "model=fake/model",
    });
    await expectEnvelope(res, "unsupported_media_type");
  });

  it("a body over the limit is the 413 envelope", async () => {
    const { app } = testApp({ maxBodyBytes: 64 });
    const res = await app.request(
      "/v1/messages",
      jsonBody({ ...message, pad: "x".repeat(200) }, withKey),
    );
    await expectEnvelope(res, "payload_too_large");
  });

  it.each([
    ["an unknown path", "GET", "/nope"],
    ["a wrong method", "GET", "/v1/messages"],
  ])("%s is the 404 envelope with one request record", async (_, method, path) => {
    const { app, requests } = testApp();
    const res = await app.request(path, { method });
    await expectEnvelope(res, "not_found");
    expect(requests()).toHaveLength(1);
    expect(requests()[0]).toMatchObject({ status: 404 });
  });

  it("a thrown defect is a generic 500; the log has its class, not its message", async () => {
    const unused = () => Promise.reject(new Error("unused"));
    const failing: Store = {
      getCompany: unused,
      getTier: unused,
      findEmployeeByKey: () => Promise.reject(new TypeError("db password=hunter2")),
      listUsageSince: unused,
      addUsage: unused,
    };
    const { app, records } = testApp({ gateway: testGateway({ store: failing }) });
    const res = await app.request("/v1/messages", jsonBody(message, withKey));
    const envelope = await expectEnvelope(res, "internal");
    expect(JSON.stringify(envelope)).not.toContain("hunter2");
    const logged = records.find((record) => record.msg === "unhandled error");
    expect(logged).toMatchObject({ errorClass: "TypeError", requestId: envelope.error.requestId });
    expect(JSON.stringify(records)).not.toContain("hunter2");
  });
});
