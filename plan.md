# Asguard Sprint Plan

Last reviewed: 2026-11-03 (Sprint 29)

## Completed in Sprint 29

1. **AI deadline is a real deadline** (`asguard-interceptor/src/aiService.ts`)
   - [x] One absolute `Deadline` clock shared by the primary, the failover and both body reads.
         Worst case is the 8s ceiling, not 16s.
   - [x] Abort timer stays armed until the body is consumed — a `200` with a stalling body can no
         longer hang the classifier.
   - [x] `PRIMARY_LEG_BUDGET_SHARE = 0.6` keeps failover reachable when the primary hangs.
   - [x] `generate()` returns `deadlineMs` / `elapsedMs`.
2. **Telemetry fallback actually persists** (`asguard-interceptor/src/telemetry.ts`)
   - [x] `resolveFallbackQueue()` points writes and the flush at the same namespace
         (`TELEMETRY_FALLBACK_QUEUE` → `ASGUARD_KV_BUFFER` → `ASGUARD_TELEMETRY`). The write side was
         targeting an unbound name, so every Supabase rejection was dropped.
   - [x] `flushBufferedTelemetry()` resolves `NEXT_PUBLIC_SUPABASE_URL`, refuses to flush with no URL,
         and retains undelivered entries.
   - [x] `TELEMETRY_WRITE_TIMEOUT_MS` applied to the AXIM Core leg and the backlog flush.
3. **Ingest fails closed** (`soc-cockpit/src/app/api/ingest/route.ts`)
   - [x] Removed the `default_ingest_token` fallback: unconfigured → `503`, mismatch → `401`.
   - [x] Constant-time `safeEqual()` without a length short-circuit.
   - [x] `sendTelemetryToCockpit()` stops guessing the secret; buffers and logs instead.
4. **Cockpit SSE route under test** (`soc-cockpit/tests/ingest-stream.test.ts`)
   - [x] 20 tests: headers, 15s heartbeat cadence, abort teardown, already-aborted request,
         13 SSRF rejections asserting `fetch` was never called, proxy re-framing.
   - [x] 7 tests pinning fail-closed ingest auth, including that `default_ingest_token` is dead.
   - [x] `vitest` + `npm test` in `soc-cockpit`; CI cockpit job runs tests between lint and build.
   - [x] Interceptor suite extended to 56 tests (body-read bound, shared budget, fallback queue).
5. **Documentation** — README, CHANGELOG, PROGRESS_LOG, DEBUGGING_NOTES, this plan.

## Completed in Sprint 28

1. **SSE hardening** (`soc-cockpit/src/app/api/ingest/stream/route.ts`)
   - [x] 15s `: keep-alive\n\n` comment heartbeats on both GET and POST channels.
   - [x] Abort-aware teardown via `request.signal.aborted` plus a listener, with an idempotent
         `close()` so double-teardown is harmless.
   - [x] SSRF validation on the POST proxy target (scheme, credentials, loopback/RFC1918/
         link-local, internal ports).
2. **LiveThreatFeed resilience** (`soc-cockpit/src/components/LiveThreatFeed.tsx`)
   - [x] Exponential backoff reconnection, 1s → 30s capped, unique channel name per attempt.
   - [x] Green/amber/red latency badge driven by real delivery lag, with a staleness watchdog.
   - [x] Defensive null-coalescing on every rendered threat field (`asText`, `formatTimestamp`).
   - [x] Gap recovery actually wired to `lastEventTimestamp`.
   - [x] Origin filter applied (was inert).
3. **AI classifier fail-safe** (`asguard-interceptor/src/aiService.ts`)
   - [x] Deterministic fallback payload; SSE-shaped when the caller asked for a stream.
4. **Edge perimeter** (`asguard-interceptor/src/threatEngine.ts`, `src/index.ts`)
   - [x] CGI argument injection → `CGI_INJECTION`, 403.
   - [x] PHP shell probe detection (`.php`, `.phtml`, `.phar`, `/wp-admin`) → 403.
   - [x] Double-encoding (`.%252e%252e`) traversal bypass closed.
   - [x] Global blocklist interlock runs first, as a single parallel KV gate.
5. **Infrastructure**
   - [x] `.github/workflows/ci.yml`, and a cockpit `package-lock.json` that `npm ci` accepts.
   - [x] Root `README.md` rewritten for the Asguard SOC/WAF architecture.

## Next priorities

1. **Set real KV namespace IDs.** `asguard-interceptor/wrangler.toml` still carries
   `new_buffer_id_here` (`ASGUARD_KV_BUFFER`) and `new_threat_cache_id_here` (`THREAT_CACHE`).
   `--dry-run` accepts them; a real `wrangler deploy` will not. **Needs operator input** — the IDs
   come from the Cloudflare account.
2. **Land the dependency refresh as one coordinated change.** Six Dependabot PRs are open.
   #158's cockpit job fails at `Install dependencies` (stale lockfile on the branch, not a code
   defect) — needs a rebase. #161 (`zod` 3 → 4) is breaking in a way that spans both components:
   it removes `z.string().ip()`, which `asguard-interceptor/src/telemetry.ts`'s
   `TelemetryPayloadSchema` uses, so the schema must move with it. Do that one separately, not as a
   Dependabot merge. #164/#165 bump transitive/dev-only `qs` and `follow-redirects`; low value alone.
3. **Real ingest → SSE fan-out.** `POST /api/ingest` still awaits a `fetch` back into
   `/api/ingest/stream`, which is the SSRF-validated *proxy* route and answers `400` to the payload
   it is given. See DEBUGGING_NOTES Sprint 29 #6. The fix is a Durable Object (or Queue) publish
   path, not an in-memory subscriber set — isolates do not share memory.
4. **Make `wrangler deploy --dry-run` blocking in CI** once `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` are repository secrets. It currently passes with empty secrets because
   `--dry-run` never authenticates.
5. **Split `asguard-interceptor/src/index.ts`** (700 lines, one handler). Extract the admin routes
   (`/blocklist`, `/audit`, `/telemetry`) and the rate limiter into modules; the request pipeline is
   harder to unit test in isolation than it needs to be.
6. **Replace the in-memory rate limiter** with a Durable Object or the Cloudflare Rate Limiting
   binding. `rateLimitMap` is per-isolate, so protection is proportional to the number of live
   isolates rather than the size of the botnet.
7. **`SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` consolidation** — two names for one value has now
   caused two outages (DEBUGGING_NOTES Sprint 28 #5 and Sprint 29 #3). Pick one at the boundary and
   resolve it once.
8. **Edge-cache invalidation for `/blocklist`** — the 30s `Cache-Control` on the interceptor plus
   the cockpit's 5s `s-maxage` means a manual drop can take ~35s to be visible to operators.
9. **Client-side DNS resolution for the SSE proxy SSRF guard.** `validateUpstreamUrl()` rejects
   literal private hosts, but a hostname that resolves to a private address (DNS rebinding) still
   passes. Cloudflare Workers cannot resolve DNS before `fetch`, so this needs an allowlist of
   egress hosts instead. The new test suite covers the literal-host cases; rebinding stays open.
10. **Jitter on the realtime reconnect backoff.** `scheduleReconnect()` uses pure exponential
    backoff (1s → 30s). Every cockpit instance that lost the socket at the same moment reconnects at
    the same moment; add ±20% jitter.

## Standing constraints

- Never introduce a feature while `npm test` or `npm run build` is red on either component.
- The interceptor fails closed: a confirmed CRITICAL threat is `403`, and a telemetry write failure
  is never allowed to change a request verdict.
- All telemetry dispatch is `ctx.waitUntil()`. No exceptions.
- AI inference is advisory and capped at 8 seconds total, body reads included.
- No authentication path may have a default secret. Unconfigured means refuse, not accept.
