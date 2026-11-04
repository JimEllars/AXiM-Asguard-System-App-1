# Asguard Sprint Plan

Last reviewed: 2026-11-04 (Sprint 30)

## Completed in Sprint 30

1. **The edge-admin proxy fails closed** (`soc-cockpit/src/app/api/asguard/[...path]/route.ts`)
   - [x] Replaced `isSuperUser || (token && jwtSecret) || serviceToken` with a single
         `authorizeAdmin()` that returns `admin | forbidden | unauthenticated`.
   - [x] Dropped the `x-user-role` **request**-header grant. `middleware.ts` writes that header to
         the outgoing *response*, so any value on the request came from the client — it was a
         super-user grant to anyone with curl.
   - [x] Dropped the `AXIM_SERVICE_TOKEN` disjunct. It is *our* credential to the interceptor, so
         its presence authorised every caller and the proxy then attached it upstream.
   - [x] Authorisation now requires a JWT verified with `ASGUARD_JWT_SECRET` carrying
         `axim_internal_admin: true` — the same claim `app/layout.tsx` gates the console on, so
         "can see the dashboard" and "can act through it" are the same set by construction.
   - [x] `X-Asguard-Service-Token` is only attached when the variable is actually set
         (`Headers.set(name, undefined)` sent the literal `"undefined"`).
   - [x] 9 regression tests; 4 of them return `200` instead of `401` against the old code.
2. **Threat-stream teardown** (`soc-cockpit/src/app/api/v1/threats/stream/route.ts`)
   - [x] `req.signal.aborted` pre-check — a client that disconnected before the handler ran never
         fired `abort`, so the 15 s interval ticked for the isolate's lifetime and the writer never
         closed.
   - [x] `cleanup` hoisted above `safeWrite` and made idempotent (interval + channel + writer
         released once). It previously closed over a `const` declared below it — a TDZ trap.
   - [x] Hydration loop and `subscribe()` abort-guarded; bootstrap rejection now tears down.
   - [x] Transport headers aligned with the ingest route (`charset=utf-8`, `X-Accel-Buffering: no`).
   - [x] 8 regression tests; 4 fail against the old code, one by timing out on the leaked stream.
3. **Roadmap audit** — items 1-5 from Sprint 29's roadmap (`plan.md` Step 4) verified present in the
   live code rather than assumed: SSE heartbeats at 15 s with abort-aware teardown, `LiveThreatFeed`
   backoff 1 s → 30 s with latency badges and null-coalescing, `AI_TIMEOUT_CEILING_MS = 8000` with a
   deterministic fallback, `ctx.waitUntil()` on every telemetry dispatch, and the blocklist interlock
   running before routing. No code changes were needed; the gap was in the two surfaces above.
4. **Open-PR audit** — 8 open PRs, all Dependabot. Four fail `npm ci` (see next priority 1).

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

1. **Regenerate the four failing Dependabot lockfiles.** #169 (tinypool/vitest), #168 (vite/vitest),
   #161 (zod 3 → 4) and #158 (`@opennextjs/cloudflare` 1.20.2) all fail `cockpit (lint + build)`
   identically at `npm ci` in ~8 s with `Missing: zod@3.25.76 from lock file` — each branch was cut
   from an older `main` and Dependabot rebuilt `soc-cockpit/package-lock.json` without the
   intervening zod pin. `origin/main` itself is in sync. **#161 still needs doing separately**: zod 4
   removes `z.string().ip()`, which `asguard-interceptor/src/telemetry.ts`'s
   `TelemetryPayloadSchema` uses, so that bump has to move the schema with it and cannot be a
   straight merge. The other three can go together as one lockfile-refresh change set.
2. **Set real KV namespace IDs.** `asguard-interceptor/wrangler.toml` still carries
   `new_buffer_id_here` (`ASGUARD_KV_BUFFER`) and `new_threat_cache_id_here` (`THREAT_CACHE`).
   `--dry-run` accepts them; a real `wrangler deploy` will not. **Needs operator input** — the IDs
   come from the Cloudflare account.
3. **Pin `wrangler` in `asguard-interceptor`.** It is not a declared devDependency, so CI's
   `npx wrangler deploy --dry-run` resolves whatever the registry serves that day (it passes, in
   26 s). Adding it requires bumping `@cloudflare/workers-types` 4 → 5 to satisfy wrangler's peer
   range, so it belongs in the same change set as (1).
4. **Real ingest → SSE fan-out.** `POST /api/ingest` still awaits a `fetch` back into
   `/api/ingest/stream`, which is the SSRF-validated *proxy* route and answers `400` to the payload
   it is given. See DEBUGGING_NOTES Sprint 29 #6. The fix is a Durable Object (or Queue) publish
   path, not an in-memory subscriber set — isolates do not share memory.
5. **Make `wrangler deploy --dry-run` blocking in CI** once `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` are repository secrets. It currently passes with empty secrets because
   `--dry-run` never authenticates.
6. **Tune the RCE heuristic before it pages someone.** `threatEngine.ts` matches on a bare `;`
   or `|` anywhere in the path or query string, so a perfectly ordinary `?a=1;b=2` is classified
   CRITICAL and answered with 403. That is fail-closed, which is why it was left alone, but it is
   also a self-inflicted outage waiting for the first caller that uses a semicolon separator. Needs
   a detection-tuning decision from the operator — see DEBUGGING_NOTES Sprint 30, observation 4.
7. **Split `asguard-interceptor/src/index.ts`** (700 lines, one handler). Extract the admin routes
   (`/blocklist`, `/audit`, `/telemetry`) and the rate limiter into modules; the request pipeline is
   harder to unit test in isolation than it needs to be.
8. **Replace the in-memory rate limiter** with a Durable Object or the Cloudflare Rate Limiting
   binding. `rateLimitMap` is per-isolate, so protection is proportional to the number of live
   isolates rather than the size of the botnet.
9. **`SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` consolidation** — two names for one value has now
   caused two outages (DEBUGGING_NOTES Sprint 28 #5 and Sprint 29 #3). Pick one at the boundary and
   resolve it once.
10. **Edge-cache invalidation for `/blocklist`** — the 30 s `Cache-Control` on the interceptor plus
    the cockpit's 5 s `s-maxage` means a manual drop can take ~35 s to be visible to operators.
11. **Client-side DNS resolution for the SSE proxy SSRF guard.** `validateUpstreamUrl()` rejects
    literal private hosts, but a hostname that resolves to a private address (DNS rebinding) still
    passes. Cloudflare Workers cannot resolve DNS before `fetch`, so this needs an allowlist of
    egress hosts instead. The new test suite covers the literal-host cases; rebinding stays open.
12. **Jitter on the realtime reconnect backoff.** `scheduleReconnect()` uses pure exponential
    backoff (1 s → 30 s). Every cockpit instance that lost the socket at the same moment reconnects
    at the same moment; add ±20% jitter.
13. **Make the proxy's role model explicit.** `authorizeAdmin()` now trusts exactly one claim. If
    the passport JWT ever carries a broader role taxonomy (`role: "super_user"`, scoped operator
    roles), decide here which claims map to which proxy verbs — `GET` on `audit`/`telemetry` is a
    read, `POST/DELETE` on `blocklist` is a write, and they probably should not require the same
    principal.

## Standing constraints

- Never introduce a feature while `npm test` or `npm run build` is red on either component.
- The interceptor fails closed: a confirmed CRITICAL threat is `403`, and a telemetry write failure
  is never allowed to change a request verdict.
- All telemetry dispatch is `ctx.waitUntil()`. No exceptions.
- AI inference is advisory and capped at 8 seconds total, body reads included.
- No authentication path may have a default secret. Unconfigured means refuse, not accept.
