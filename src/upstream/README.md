# Upstreams

The inference providers the gateway forwards to. Start with [types.ts](types.ts): the `Upstream` interface with `send` (JSON) and `stream` (server-sent events), which both implementations satisfy.

- [openrouter.ts](openrouter.ts) posts to OpenRouter's Anthropic Messages endpoint with the company's `OPENROUTER_KEY`, forwarding only `anthropic-*` headers, and reads token usage and OpenRouter's reported cost. `fetch` is injected, so tests never touch the network. A request with no key, a failed connection or a timeout becomes `UpstreamUnavailableError` (502).
- [fake.ts](fake.ts) answers in process for any `fake/` model id. `x-fake-*` request headers choose token counts, latency, status, a dropped stream or an unreachable provider, which is how the tests and the budget demo stay deterministic and free. `readFakeControls` checks the numeric headers (token counts 0 to 10,000,000, status 200 or 400 to 599, delay 0 to 10,000 ms, drop-after 0 to 1,000); the gateway calls it before its budget decision, so a bad value is a 400 that records nothing.
- [select.ts](select.ts) picks one by model id prefix.
