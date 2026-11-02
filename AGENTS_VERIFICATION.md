# Agents Verification — Sprint 28 (2026-11-02)

Verification appendix for the daily Asguard SOC review. Every command below was executed locally on
a Node v22.23.4 / npm 10.9.9 host before the branch was pushed.

- Branch: `feat/asguard-sprint-28-ssse-hardening-blacklist-interlock`
- Base commit: `9aa2c5f` (origin/main — "Merge pull request #157")
- Upstream sync: no human commits on `origin/main` in the preceding 24h; 5 open PRs, all Dependabot.

## Files modified

| File | Change | Lines |
| --- | --- | --- |
| `asguard-interceptor/src/threatEngine.ts` | Rewritten: CGI injection, PHP shell probes, double-encoded traversal, exported `ThreatSeverity`/`ThreatVerdict`, deterministic fallback classifier | 201 → 199 (+/- 138) |
| `asguard-interceptor/src/aiService.ts` | Rewritten: `AI_TIMEOUT_CEILING_MS = 8000`, shared `fetchWithDeadline()`, SSE-shaped degraded fallback | 156 → 216 (+/- 156) |
| `asguard-interceptor/src/index.ts` | Blocklist interlock consolidated as a first-stage parallel KV gate; `ctx` threaded into `analyzeThreat`/`logAIInference`; dead commented telemetry removed | 680 → 643 (-/+ 63) |
| `asguard-interceptor/src/telemetry.ts` | `dbUrl` derived from resolved URL; duplicated KV buffer write removed | 474 → 471 (+/- 13) |
| `asguard-interceptor/tests/hardening.test.ts` | New: 24 tests (CGI, traversal, PHP probes, interlock, AI timeout) | new, 234 |
| `soc-cockpit/src/app/api/ingest/stream/route.ts` | Rewritten: `createSseChannel()` helper, 15s keep-alive, abort-aware teardown, SSRF guard on the proxy target | 157 → 232 (+/- 343) |
| `soc-cockpit/src/components/LiveThreatFeed.tsx` | Backoff reconnect (1s→30s), latency badges, `asText`/`formatTimestamp` null-coalescing, origin filter, gap recovery wiring | 556 → 604 (+/- 340) |
| `soc-cockpit/next.config.ts` | `outputFileTracingRoot` pinned (silences dual-lockfile root inference) | 5 → 10 |
| `soc-cockpit/package-lock.json` | Regenerated to sync with `package.json` (`@hey-api/*`, `c12`, `commander@15`, `js-yaml@4.2.0` + transitive) | 1357 → 1390 entries |
| `.github/workflows/ci.yml` | New CI pipeline | new, 68 |
| `README.md` | Rewritten for Asguard SOC/WAF architecture; legacy Web3/Greta boilerplate removed | 9 → 197 |
| `plan.md` | Reconciled: sprint 28 completion + next priorities | 24 → 92 |
| `CHANGELOG.md` | New | 79 |
| `DEBUGGING_NOTES.md` | New | 157 |
| `.gitignore` | Ignore runtime scratch (`*.pid`, `test-results/`, `.open-next/`, `.env*`) | +14 |
| `dev_pid.txt`, `nextjs.pid`, `test-results/.last-run.json` | Deleted (committed runtime scratch) | -6 |

## Verification battery — verbatim output

### 1. `asguard-interceptor` — typecheck

```
$ npx tsc --noEmit
(no output — exit 0)
```

### 2. `asguard-interceptor` — unit and integration tests

```
$ npm test
> asguard-interceptor@1.0.0 test
> vitest run

 RUN  v1.6.1 /workspace/review/axim-asguard/asguard-interceptor

 ✓ tests/interceptor.test.ts  (25 tests) 862ms
 ✓ tests/hardening.test.ts  (24 tests) 235ms

 Test Files  2 passed (2)
      Tests  49 passed (49)
```

Run six consecutive times after the test-isolation fixes below; 49/49 every time.

### 3. `asguard-interceptor` — Wrangler deploy dry-run

```
$ ../soc-cockpit/node_modules/.bin/wrangler deploy --dry-run --outdir /tmp/asguard-dryrun

 ⛅️ wrangler 4.112.0
────────────────────
Total Upload: 163.88 KiB / gzip: 29.87 KiB
Your Worker has access to the following bindings:
Binding                                                               Resource
env.ASGUARD_KV_BUFFER (new_buffer_id_here)                            KV Namespace
env.ASGUARD_BLACKLIST (53ed082bcd0f465c94f08626c97160ca)              KV Namespace
env.ASGUARD_TELEMETRY (9141c0fd3eb44d3c84375f418c716495)              KV Namespace
env.THREAT_CACHE (new_threat_cache_id_here)                           KV Namespace
env.SUPABASE_URL ("")                                                 Environment Variable
env.SUPABASE_SERVICE_ROLE_KEY ("")                                    Environment Variable
env.ASGUARD_API_KEY ("")                                              Environment Variable
env.COCKPIT_INGEST_URL ("")                                           Environment Variable
env.ASGUARD_SERVICE_TOKEN ("")                                        Environment Variable
env.TELEMETRY_INGEST_KEY ("")                                         Environment Variable
env.DEEPSEEK_API_KEY ("")                                             Environment Variable
env.ANTHROPIC_API_KEY ("")                                            Environment Variable
env.DEEPSEEK_BASE_URL ("")                                            Environment Variable
env.DEEPSEEK_MODEL ("")                                               Environment Variable
env.AXIM_SERVICE_ROLE_KEY ("")                                        Environment Variable

--dry-run: exiting now.
```

All four KV bindings resolve (`ASGUARD_KV_BUFFER`, `ASGUARD_BLACKLIST`, `ASGUARD_TELEMETRY`,
`THREAT_CACHE`). Note: `ASGUARD_KV_BUFFER` and `THREAT_CACHE` still carry placeholder IDs
(`new_buffer_id_here`, `new_threat_cache_id_here`) — an operator must set real namespace IDs before
the next real deploy. Recorded in `plan.md`.

### 4. `soc-cockpit` — lint

```
$ npm run lint
> soc-cockpit@0.1.0 lint
> eslint

(no output — exit 0)
```

### 5. `soc-cockpit` — production build (Next.js 15.5.18)

```
$ npm run build
> soc-cockpit@0.1.0 build
> next build

   ▲ Next.js 15.5.18

   Creating an optimized production build ...
 ⚠ Compiled with warnings in 13.9min

./node_modules/@coinbase/cdp-sdk/node_modules/ox/_esm/tempo/internal/virtualMasterPool.js
Critical dependency: the request of a dependency is an expression
... (thirdweb → @base-org/account → @coinbase/cdp-sdk → ox, 17 frames; pre-existing vendor warning)

   Collecting page data ...
   Generating static pages (0/13) ...
 ✓ Generating static pages (13/13)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ƒ /                                    5.57 kB         189 kB
├ ƒ /_not-found                             1 kB         118 kB
├ ƒ /api/asguard/[...path]                 164 B         117 kB
├ ƒ /api/chat                              164 B         117 kB
├ ƒ /api/health                            164 B         117 kB
├ ƒ /api/ingest                            164 B         117 kB
├ ƒ /api/ingest/stream                     164 B         117 kB
├ ƒ /api/ready                             164 B         117 kB
├ ƒ /api/v1/threats/stream                 164 B         117 kB
├ ƒ /api/v1/triage/dispatch                164 B         117 kB
├ ƒ /auth/callback                         164 B         117 kB
├ ƒ /stream                              6.16 kB         189 kB
└ ƒ /submit                              3.15 kB         120 kB
+ First Load JS shared by all             117 kB
  ├ chunks/31255-c7473391749ab718.js       46 kB
  ├ chunks/4bd1b696-bad92808725a934a.js  54.2 kB
  ├ chunks/webpack-96d3042a18233b3c.js   16.6 kB
  └ other shared chunks (total)            239 B

ƒ Middleware                             95.5 kB

ƒ  (Dynamic)  server-rendered on demand

EXIT=0
```

The only build warning comes from thirdweb's `@coinbase/cdp-sdk → ox` vendor tree and predates this
change set. `next build` performs its own TypeScript pass; it completed with no type errors across
all 13 routes.

### 6. `soc-cockpit` — clean install from the regenerated lockfile

```
$ npm ci --include=dev
added 1251 packages in 54m
```

This is the check that matters for CI: `npm ci` previously failed with
`npm error code EUSAGE ... can only install packages when your package.json and package-lock.json
are in sync`, listing `@hey-api/openapi-ts`, `@hey-api/codegen-core`, `c12`, `commander@15`,
`js-yaml@4.2.0` and nine others as missing. After `npm install --package-lock-only` the lock holds
1390 entries and `npm ci` completes cleanly.

## Requirement traceability

| Directive | Evidence |
| --- | --- |
| 15s SSE keep-alive (`: keep-alive\n\n`) | `KEEP_ALIVE_INTERVAL_MS = 15000`; heartbeat writes the comment frame on both GET and POST |
| Clean `req.signal.aborted` disconnect handling | `createSseChannel()` checks `request.signal.aborted` at construction and attaches an abort listener; `close()` is idempotent |
| Backoff reconnection 1s–30s | `RECONNECT_BASE_MS/MAX_MS` + `scheduleReconnect()`, test-covered indirectly via module constants |
| Latency badges green/amber/red | `LATENCY_LIVE_MS`/`LATENCY_LAGGING_MS` + `LATENCY_BADGE` map, rendered in the metric card and the Telemetry Grid header |
| Defensive null-coalescing | `asText()` / `formatTimestamp()` / `timestampMs()` replace every raw `new Date(...)` and string method on threat data |
| 8s AI timeout | `AI_TIMEOUT_CEILING_MS = 8000`; asserted in `hardening.test.ts` ("pins the ceiling at 8 seconds") |
| Deterministic fallback payload | `deterministicFallbackClassification()`; asserted in two tests (JSON + SSE shape) |
| CGI injection → 403 | 9 parameterised URL cases classify as `CGI_INJECTION`; an end-to-end test asserts `403` + `X-Asguard-Threat-Category` |
| Path traversal → 403 | 3 cases incl. `%2e%2e` and `%252e%252e` |
| `ctx.waitUntil()` telemetry | `logToSupabase`, `logAIInference`, `logAIFailure`, `sendTelemetryToCockpit` all dispatch via `ctx.waitUntil()`; `/analysis` now passes its `ExecutionContext` |
| `ASGUARD_BLACKLIST` checked before processing | Single `Promise.all` gate ahead of routing; asserted for both `blocked-blacklist` and `blocked-edge-kv` paths |
| README without Web3/Greta boilerplate | Root `README.md` rewritten; `grep -i "greta\|web3-6337"` returns nothing |

## Test-suite flake repaired during this review

`npm test` initially passed 49/49, then failed intermittently (roughly 1 run in 3). Two independent
isolation defects were responsible:

1. **Module-level limiter state leaked between cases.** `rateLimitMap`, `penaltyLedger` and
   `clientErrorThrottleMap` live at module scope and survive across tests in the same file. A case
   that used `cf-connecting-ip: 1.2.3.4` could push the shared 10-requests-per-10s window over the
   limit and make a *later* case receive `429` instead of `200`/`202`, depending on how fast the
   preceding tests ran. Added `__resetEdgeStateForTests()` (exported, documented as test-only) and
   called it from `beforeEach` in both suites.
2. **A backgrounded telemetry write raced the `global.fetch` swap.** `logToSupabase` dispatches
   through `ctx.waitUntil`, and several cases pass a mocked `ctx.waitUntil` that never awaits. Those
   `executeLog()` chains stay in flight into the next test, then resolve against the *new* `fetch`
   mock and overwrite the last-write-wins `fetchUrl` capture in "asserts logToSupabase formats
   payload correctly". The test now records every fetch call, selects the one targeting
   `https://db.axim.us.com/rest/v1/threat_events`, and polls for it (5s ceiling) instead of assuming
   a single macrotask tick, because `executeLog` awaits `crypto.subtle.digest` before the request.

Six consecutive clean runs after both fixes.

## Environment notes

- The host has 3.9 GB RAM and was simultaneously running other agents' installs and builds (load
  average peaked at ~12). The first three `npm install` attempts for `soc-cockpit` were OOM-killed or
  dropped by `ECONNRESET`; the successful run used the regenerated lockfile plus a warm cache.
- `gh` is not installed on this host; PR management used the GitHub REST API with the configured
  token.
