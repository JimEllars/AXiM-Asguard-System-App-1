# Asguard Sprint Plan

Last reviewed: 2026-11-02 (Sprint 28)

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
   - [x] Single `AI_TIMEOUT_CEILING_MS = 8000` deadline shared by both provider legs.
   - [x] Deterministic fallback payload; SSE-shaped when the caller asked for a stream.
4. **Edge perimeter** (`asguard-interceptor/src/threatEngine.ts`, `src/index.ts`)
   - [x] CGI argument injection (`?-d`, `auto_prepend_file`, `auto_append_file`,
     `allow_url_include`, `disable_functions`, `safe_mode`) → `CGI_INJECTION`, 403.
   - [x] PHP shell probe detection (`.php`, `.phtml`, `.phar`, `/wp-admin`) → 403.
   - [x] Double-encoding (`.%252e%252e`) traversal bypass closed.
   - [x] Global blocklist interlock runs first, as a single parallel KV gate.
5. **Telemetry** (`asguard-interceptor/src/telemetry.ts`)
   - [x] All dispatch paths non-blocking via `ctx.waitUntil()`; `ctx` threaded through the
         `/analysis` path into `logAIInference`.
   - [x] Fixed `undefined/rest/v1/threat_events` URL construction.
   - [x] Removed duplicated KV buffer write on the failure path.
6. **Infrastructure**
   - [x] `.github/workflows/ci.yml` — the repo previously had no CI at all.
   - [x] Regenerated `soc-cockpit/package-lock.json`. The lock was out of sync with
         `package.json` (`@hey-api/*`, `c12`, `commander@15`, `js-yaml@4.2.0` and nine other
         transitive entries missing), so `npm ci` failed with `EUSAGE` and the CI job could never
         pass on a clean runner. The lock now holds 1390 entries and `npm ci` completes.
   - [x] Root `README.md` rewritten for the Asguard SOC/WAF architecture (legacy Web3/Greta
         boilerplate removed).
7. **Documentation**
   - [x] `DEBUGGING_NOTES.md`, `AGENTS_VERIFICATION.md`, `CHANGELOG.md` reconciled.

## Next priorities

1. **Resolve the open Dependabot PRs** (#158–#162). #161 bumps `zod` 3 → 4 in the cockpit, which
   removes `z.string().ip()` — the interceptor's `TelemetryPayloadSchema` uses exactly that API, so
   the two schemas must move together. Land them as one coordinated change, not five.
2. **Set real KV namespace IDs.** `asguard-interceptor/wrangler.toml` still carries
   `new_buffer_id_here` (`ASGUARD_KV_BUFFER`) and `new_threat_cache_id_here` (`THREAT_CACHE`).
   `--dry-run` accepts them; a real `wrangler deploy` will not.
3. **Add an interceptor-side SSE consumer test** — the cockpit's SSE route has no automated
   coverage at all; everything is verified by hand.
4. **Make `wrangler deploy --dry-run` blocking in CI** once `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` are configured as repository secrets. It currently runs with empty
   secrets and still passes, because `--dry-run` never authenticates.
5. **Split `asguard-interceptor/src/index.ts`** (643 lines, one handler). Extract the admin routes
   (`/blocklist`, `/audit`, `/telemetry`) and the rate limiter into modules; the request pipeline is
   currently hard to unit test in isolation.
6. **Replace the in-memory rate limiter** with a Durable Object or the Cloudflare Rate Limiting
   binding. `rateLimitMap` is per-isolate, so protection is proportional to the number of live
   isolates rather than the size of the botnet.
7. **`SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` consolidation** — two names for one value has
   already caused one production telemetry outage (see `DEBUGGING_NOTES.md` #5). Pick one.
8. **Edge-cache invalidation for `/blocklist`** — the 30s `Cache-Control` on the interceptor plus
   the cockpit's 5s `s-maxage` means a manual drop can take ~35s to be visible to operators.
9. **Client-side DNS resolution for the SSE proxy SSRF guard.** `validateUpstreamUrl()` rejects
   literal private hosts, but a hostname that resolves to a private address (DNS rebinding) still
   passes. Cloudflare Workers cannot resolve DNS before `fetch`, so this needs an allowlist of
   egress hosts instead.

## Standing constraints

- Never introduce a feature while `npm test` or `npm run build` is red on either component.
- The interceptor fails closed: a confirmed CRITICAL threat is `403`, and a telemetry write failure
  is never allowed to change a request verdict.
- All telemetry dispatch is `ctx.waitUntil()`. No exceptions.
- AI inference is advisory and capped at 8 seconds.
