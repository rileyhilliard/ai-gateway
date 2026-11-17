# Gateway

`POST /v1/messages`, the Anthropic Messages endpoint employees and tools like Claude Code call.

Start with [messages-route.ts](messages-route.ts). It checks the key ([authenticate.ts](authenticate.ts)) before the body is validated, so a bad key is always a 401, then hands the request to [service.ts](service.ts) and passes the provider's answer back unchanged.

`service.ts` is one request end to end: read the `x-project` tag, check the model has a price, run the budget decision, record a block or forward the request, and record the cost from the provider's usage. For a `stream: true` request, [stream-usage.ts](stream-usage.ts) reads usage from the server-sent events as they pass through, and the record is written when the stream ends.

[anthropic-errors.ts](anthropic-errors.ts) renders errors on `/v1/*` in Anthropic's shape, so the SDKs raise typed errors (a budget block becomes a `RateLimitError`).

Depends on `../budget/`, `../store/types.ts` and `../upstream/`; nothing outside `app.ts` imports from here.
