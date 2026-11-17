# Health route

[health.ts](health.ts) declares `GET /healthz`, which answers `{"status":"ok"}` while the process is up. It reads no state, so a load balancer can probe it without a key. The request logger records it at debug level to keep probes out of the info log.

Feature routes live with their features: `../gateway/messages-route.ts` and `../admin/`. [../app.ts](../app.ts) mounts them all.
