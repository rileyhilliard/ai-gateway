# Phase 4: Anthropic-shaped errors for real clients

Status: planned.
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Demo: an Anthropic SDK script pointed at the gateway with an employee key shows a 429 budget error as a typed `RateLimitError` with our message.
Depends on: phase 1.

| Lane | Size | Owns files | Model |
| --- | --- | --- | --- |
| inline | S | error rendering for `/v1/messages` as `{ type: "error", error: { type, message } }` with the budget details kept, plus `http/gateway.http` updates | me |
