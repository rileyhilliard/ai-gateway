# Phase 5: streaming, so Claude Code works through the gateway

Status: planned.
Shared spec, error model and contracts: [spec.md](spec.md). Overview and phase status: [README.md](README.md).

Demo: Claude Code with `ANTHROPIC_BASE_URL` set to the gateway and an employee key in `ANTHROPIC_AUTH_TOKEN`; its spend shows up in the usage view.
Depends on: phase 4. Pass OpenRouter's SSE stream through and record usage from `message_start` and the final `message_delta`, using `usage.cost` when OpenRouter includes it. A stream that drops mid-way charges for the usage seen so far.
