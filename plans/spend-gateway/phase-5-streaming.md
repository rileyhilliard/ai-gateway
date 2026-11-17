# Phase 5: streaming, so Claude Code works through the gateway

Status: lane a (opus) running from seam `727bece`.
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Demo: Claude Code with `ANTHROPIC_BASE_URL=http://localhost:3000`, an employee key in `ANTHROPIC_API_KEY` (sent as `x-api-key`), and `ANTHROPIC_MODEL` / `ANTHROPIC_SMALL_FAST_MODEL` set to `deepseek/deepseek-v4.1-flash-1017`, since the gateway only accepts priced OpenRouter ids. Its spend shows up in `GET /admin/usage`.
Depends on: phase 4.

## Behavior

- A body with `stream: true` is streamed. The key check, model check and budget decision run first, exactly as today, so a block is still a JSON 429 in Anthropic's shape before any stream starts.
- When the provider answers a streaming request with a non-2xx status, that status and body pass through as today (JSON), charged only if the body reports usage.
- On 2xx, the gateway answers `content-type: text/event-stream` and passes the provider's SSE bytes through unchanged and as they arrive (no buffering of the whole stream).
- Usage is read from the events while passing through: `message_start.message.usage.input_tokens` (and its `output_tokens`), and each `message_delta.usage` (`output_tokens` is cumulative; `input_tokens` may appear there too and wins when present). `usage.cost` (USD) on either event is OpenRouter's reported cost and wins over the price table, converted like the JSON path (micros, rounded up).
- One usage record is written when the stream ends, with the bucket from the decision and `startedAt` from before the call. A stream that ends early (the provider drops, or the client disconnects) still records the usage seen so far. A stream with no usage event at all records nothing, matching the JSON rule.
- The provider being unreachable before the response starts is a 502 `upstream_unavailable`, as today.
- Recording after the response has started can't change the response. A failure to record must not be a floating promise: log it once (error level, with the request id) and keep the stream's outcome as it was.
- Non-streaming requests behave exactly as today; every existing test stays green unchanged.

## Lane a (opus)

Owns: `src/upstream/types.ts`, `src/upstream/fake.ts`, `src/upstream/openrouter.ts`, `src/upstream/select.ts` and their tests; `src/gateway/service.ts`, `src/gateway/messages-route.ts`; new `src/gateway/stream-usage.ts` (+ test) for SSE usage parsing; new `tests/streaming-http.test.ts`; `http/gateway.http`. `src/app.ts` only if the route can't get a logger any other way; say so if you touch it.

Contract freedom: you design how `Upstream` exposes a stream (for example `send` returning a `{ kind: "json" } | { kind: "stream" }` union, or a separate method). Keep money in micros, time from the injected clock, `process`/`node:*` out of these files.

Fake upstream: with `stream: true` it emits a realistic Anthropic event sequence (`message_start`, a text `content_block_*`, `message_delta` with usage, `message_stop`) using the same `x-fake-*` headers for tokens and status. Add `x-fake-drop-after: <n>` to error the stream after n events, so a mid-stream drop is testable without the network.

Tests first, then code. Cases, by name:
- streams the provider's events through unchanged with content-type text/event-stream
- records one usage record from message_start and the final message_delta after the stream ends
- prices a stream with OpenRouter's reported usage.cost when present (openrouter unit test with a stubbed fetch returning an SSE body)
- charges the usage seen so far when the provider drops mid-stream
- charges the usage seen so far when the client cancels mid-stream
- records nothing for a stream that ends before any usage event
- blocks a streaming request with a JSON 429 before streaming starts, recording the blocked request
- passes a provider error status through for a streaming request
- logs a usage-recording failure once and still completes the stream
- the SSE parser handles events split across chunks and `\r\n` line endings

Gate: `bun run check` (about 5 s) before reporting. Commit as `phase 5 lane a: streaming responses with usage recorded at stream end`.
