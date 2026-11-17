# Phase 4: Anthropic-shaped errors for real clients

Status: done, tagged `phase-4`.
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Demo: send the error requests in `http/gateway.http` and see `{ "type": "error", "error": { "type": "rate_limit_error", ... } }`. An Anthropic SDK client pointed at the gateway raises its typed errors (`RateLimitError`, `AuthenticationError`) with our message, and doesn't retry a budget block.
Depends on: phase 1.

## Decisions

Defaults taken without a grill round; override any of them.

- Only `/v1/*` (the Anthropic-compatible surface) changes shape. Admin, health and other paths keep the app's envelope, since no Anthropic client calls them. "Starts with `/v1/`" is the test, so `/v1messages` keeps the envelope.
- Body: `{ type: "error", error: { type, message, code, issues?, budget? }, request_id }`. `type` and `message` are what the SDKs read; `code`, `issues` and `budget` keep the gateway's detail for anything that wants it.
- Type mapping: 400 and 415 `invalid_request_error`, 401 `authentication_error`, 404 `not_found_error`, 413 `request_too_large`, 429 `rate_limit_error`, 500 and 502 `api_error`.
- Budget 429s send `x-should-retry: false`. The Anthropic SDKs retry 429s by default and honor this header; a budget block lasts until the reset, so retries would only add blocked records. No `retry-after`: it would need the clock in the error handler, and the reset time is already in the body.
- Provider errors are passed through untouched, as before; OpenRouter's Anthropic endpoint already sends this shape.
- No Anthropic SDK dependency: the contract tests check the shape the SDKs parse. Trying a real SDK client is a manual step.

## Contracts (in the scaffold)

`src/gateway/anthropic-errors.ts`: `AnthropicErrorBody` (zod, registered as `AnthropicError`), `anthropicErrorType(code)`, `toAnthropicError(error, requestId)`, `anthropicErrorResponse(description)`.

## Tests

`src/gateway/anthropic-errors.test.ts` (mapping for every code, body shape), `tests/anthropic-errors-http.test.ts` (each status over HTTP, `x-should-retry`, envelope kept outside `/v1`, OpenAPI refs). `tests/gateway-http.test.ts`, `tests/http-contract.test.ts` and `tests/admin-controls-http.test.ts` now parse `/v1` errors with `AnthropicErrorBody`.

## Lanes

| Lane | Size | Owns files | Model |
| --- | --- | --- | --- |
| a | S | `src/gateway/anthropic-errors.ts`, `src/app.ts` (`notFound` and `onError` pick the shape by path), `src/gateway/messages-route.ts` (error responses documented with `anthropicErrorResponse`), `http/gateway.http` (comments name the new types) | sonnet |

## Log

- Lane a (sonnet) landed clean. Accepted choices: one `renderError(c, error)` for `notFound` and `onError`; the `/v1/` prefix is a named constant; `.http` comments read "type (code x)".
