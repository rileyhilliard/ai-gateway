/**
 * Gateway errors reach Anthropic clients in Anthropic's shape: the SDKs pick the error class
 * from `error.type`, and a budget block tells them not to retry. Admin and health routes keep
 * the app's own envelope, and provider errors still pass through untouched.
 */

import { describe, expect, it } from "vitest";
import { ErrorEnvelope } from "../src/errors.ts";
import { AnthropicErrorBody } from "../src/gateway/anthropic-errors.ts";
import { ADMIN_KEY, jsonBody, testApp } from "./helpers/app.ts";

const message = {
  model: "fake/model",
  max_tokens: 64,
  messages: [{ role: "user", content: "hi" }],
};

describe("budget blocks", () => {
  it("are a rate_limit_error that tells the Anthropic SDK not to retry", async () => {
    const { app } = testApp();
    const costly = { "x-api-key": "key-intern", "x-fake-output-tokens": "10000" };
    await app.request("/v1/messages", jsonBody(message, costly));
    const res = await app.request("/v1/messages", jsonBody(message, costly));

    expect(res.status).toBe(429);
    // The SDKs retry 429s by default; this block lasts until the reset, so retries only add
    // blocked records.
    expect(res.headers.get("x-should-retry")).toBe("false");
    const body = AnthropicErrorBody.parse(await res.json());
    expect(body).toMatchObject({
      type: "error",
      error: { type: "rate_limit_error", code: "budget_exceeded" },
      request_id: res.headers.get("x-request-id"),
    });
    expect(body.error.message).toMatch(/^Daily allowance of \$0\.01 used\. Resets /);
  });

  it("are the only errors that say not to retry", async () => {
    const { app } = testApp();
    const res = await app.request(
      "/v1/messages",
      jsonBody(message, { "x-api-key": "key-staff", "x-fake-unreachable": "1" }),
    );
    expect(res.status).toBe(502);
    expect(res.headers.get("x-should-retry")).toBeNull();
  });
});

describe("other gateway errors", () => {
  const staff = { "x-api-key": "key-staff" };
  it.each([
    {
      name: "a missing key",
      headers: {},
      body: message,
      status: 401,
      type: "authentication_error",
    },
    {
      name: "an unknown model",
      headers: staff,
      body: { ...message, model: "openai/gpt-unknown" },
      status: 400,
      type: "invalid_request_error",
    },
    {
      name: "a body without a model",
      headers: staff,
      body: { messages: [] },
      status: 400,
      type: "invalid_request_error",
    },
    {
      name: "an unreachable provider",
      headers: { ...staff, "x-fake-unreachable": "1" },
      body: message,
      status: 502,
      type: "api_error",
    },
  ])("render $name in Anthropic's shape", async ({ headers, body, status, type }) => {
    const { app } = testApp();
    const res = await app.request("/v1/messages", jsonBody(body, headers));
    expect(res.status).toBe(status);
    expect(AnthropicErrorBody.parse(await res.json()).error.type).toBe(type);
  });

  it("leave a provider's own error body untouched", async () => {
    const { app } = testApp();
    const res = await app.request(
      "/v1/messages",
      jsonBody(message, { "x-api-key": "key-staff", "x-fake-status": "529" }),
    );
    expect(res.status).toBe(529);
    expect(await res.json()).toEqual({
      type: "error",
      error: { type: "api_error", message: "Fake upstream error." },
    });
  });
});

const MALFORMED_JSON_ISSUE = {
  path: "json",
  message: "Body isn't valid JSON. Send a JSON object with content-type: application/json.",
};

describe("malformed JSON bodies", () => {
  it("say what's wrong in Anthropic's shape on /v1", async () => {
    const { app } = testApp();
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "key-staff" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const { error } = AnthropicErrorBody.parse(await res.json());
    expect(error).toMatchObject({ type: "invalid_request_error", code: "bad_request" });
    // Claude Code shows only the message, so it carries the fix as well as the issue does.
    expect(error.message).toBe(MALFORMED_JSON_ISSUE.message);
    expect(error.issues).toEqual([MALFORMED_JSON_ISSUE]);
  });

  it("say what's wrong in the app's envelope on admin routes", async () => {
    const { app } = testApp();
    const res = await app.request("/admin/company/pool", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const { error } = ErrorEnvelope.parse(await res.json());
    expect(error).toMatchObject({ code: "bad_request", issues: [MALFORMED_JSON_ISSUE] });
  });
});

describe("routes outside /v1", () => {
  it("keep the app's envelope for admin errors", async () => {
    const { app } = testApp();
    const res = await app.request("/admin/usage", { headers: { "x-admin-key": "wrong-key" } });
    expect(res.status).toBe(401);
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe("unauthorized");
  });

  it("keep the app's envelope for a path that only starts like /v1", async () => {
    const { app } = testApp();
    const res = await app.request("/v1messages", {
      method: "POST",
      headers: { "x-admin-key": ADMIN_KEY },
    });
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe("not_found");
  });
});

describe("the OpenAPI document", () => {
  it("documents /v1/messages errors with the Anthropic error schema", async () => {
    const { app } = testApp();
    const doc = await (await app.request("/openapi.json")).json();
    const responses = doc.paths["/v1/messages"].post.responses;
    for (const status of ["400", "401", "429", "502"]) {
      expect(responses[status].content["application/json"].schema.$ref).toBe(
        "#/components/schemas/AnthropicError",
      );
    }
    expect(
      doc.paths["/admin/usage"].get.responses["401"].content["application/json"].schema.$ref,
    ).toBe("#/components/schemas/Error");
  });
});
