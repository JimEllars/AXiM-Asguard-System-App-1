# Agents Verification — Sprint 29 (2026-11-03)

Verification appendix for the daily Asguard SOC review. Every command below was executed locally on
a Node v22.23.4 / npm 10.9.9 host before the branch was pushed.

- Branch: `feat/asguard-sprint-29-ai-deadline-telemetry-fallback-sse-coverage`
- Base commit: `fc9bcde` (origin/main — "feat(asguard): harden edge perimeter, isolate AI timeouts, and add CI (#163)")
- Upstream sync: `git fetch origin main` + `git fetch --all --prune`; one commit on `origin/main` in
  the preceding 24h (`fc9bcde`, merged 2026-11-02 22:57Z). No human hand-edits since. Six open PRs,
  all Dependabot. Local branch rebased onto `fc9bcde` before any change.

## Scope of this change set

Sprint 28 landed the documented shape of the perimeter. This pass verified the *claims* against the
live code and found three places where behaviour did not match the contract:

1. The 8s AI budget was not a shared deadline — each provider leg got its own 8s timer, and the
   timer was released before the response body was read.
2. Telemetry rejected by Supabase was buffered into a KV binding that `wrangler.toml` does not
   declare, so every failed write was silently discarded.
3. The cockpit's ingest route authenticated against a hardcoded fallback token when
   `ASGUARD_API_KEY` was unset, i.e. an unconfigured deployment accepted writes from anyone.

## Files modified

| File | Change | Lines |
| --- | --- | --- |
| `asguard-interceptor/src/aiService.ts` | Shared `Deadline` clock across both legs; `requestWithinDeadline()` keeps the abort timer armed until the body is consumed; `PRIMARY_LEG_BUDGET_SHARE = 0.6` reserves budget for failover; `degrade()` extracted | 211 → 306 |
| `asguard-interceptor/src/telemetry.ts` | `resolveFallbackQueue()` (TELEMETRY_FALLBACK_QUEUE → ASGUARD_KV_BUFFER → ASGUARD_TELEMETRY), `bufferFailedEvent()`, `TELEMETRY_WRITE_TIMEOUT_MS`; bounded the AXIM Core ingest leg; `flushBufferedTelemetry()` now resolves `NEXT_PUBLIC_SUPABASE_URL` and refuses to flush without a URL; `sendTelemetryToCockpit()` no longer ships `default_ingest_token` | 469 → 545 |
| `asguard-interceptor/src/index.ts` | `Env` declares `ASGUARD_KV_BUFFER`, optional `TELEMETRY_FALLBACK_QUEUE`, SUPABASE/AXIM ingest vars | 683 → 700 |
| `asguard-interceptor/tests/hardening.test.ts` | +7 tests: body-read deadline bound, single shared budget, failover reservation, fallback-queue resolution/persistence/flush | 234 → 400 |
| `soc-cockpit/src/app/api/ingest/route.ts` | Fail-closed ingest auth (`503 ingest_not_configured`), `safeEqual()` constant-time compare that does not leak length | 148 → 178 |
| `soc-cockpit/tests/ingest-stream.test.ts` | New suite, 20 tests: transport headers, 15s heartbeat cadence, abort teardown, already-aborted request, 13 SSRF rejections, proxy re-framing | new, 175 |
| `soc-cockpit/tests/ingest-auth.test.ts` | New suite, 7 tests: unset secret → 503, `default_ingest_token` refused, mismatched/missing/non-Bearer/prefix tokens → 401, valid token reaches payload validation | new, 107 |
| `soc-cockpit/package.json` | `vitest` devDependency, `"test": "vitest run"` | +2 |
| `soc-cockpit/package-lock.json` | Regenerated for the vitest tree (109 added, 0 removed, 1 transitive patch bump) | 1390 → 1499 entries |
| `.github/workflows/ci.yml` | Cockpit job runs `npm test` between lint and build | 68 → 71 |
| `README.md` | Documented the fail-closed ingest contract, the shared AI deadline, and the cockpit test suite | 197 → 208 |
| `plan.md` | Sprint 29 recorded; next priorities re-ranked | 92 → 116 |
| `CHANGELOG.md` | Sprint 29 entry | prepended |
| `PROGRESS_LOG.txt` | Sprint 29 entry | prepended |
| `DEBUGGING_NOTES.md` | Four new root-cause notes | prepended |
| `.gitignore` | Repaired a literal `\n`-mangled line that broke three ignore patterns | 3 files |

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

 ✓ tests/interceptor.test.ts  (25 tests) 135ms
 ✓ tests/hardening.test.ts  (31 tests) 2644ms

 Test Files  2 passed (2)
      Tests  56 passed (56)
   Duration  28.38s
```

### 3. `asguard-interceptor` — Wrangler deploy dry-run (binding validation)

```
$ npx wrangler deploy --dry-run --outdir /tmp/ic-dry-out2
Total Upload: 167.36 KiB / gzip: 30.68 KiB
Your Worker has access to the following bindings:
env.ASGUARD_KV_BUFFER (new_buffer_id_here)                            KV Namespace
env.ASGUARD_BLACKLIST (53ed082bcd0f465c94f08626c97160ca)              KV Namespace
env.ASGUARD_TELEMETRY (9141c0fd3eb44d3c84375f418c716495)              KV Namespace
env.THREAT_CACHE (new_threat_cache_id_here)                           KV Namespace
env.ASGUARD_API_KEY ("")                                              Environment Variable
env.ASGUARD_SERVICE_TOKEN ("")                                        Environment Variable

--dry-run: exiting now.
EXIT=0
```

Note: `ASGUARD_KV_BUFFER` is bound and is what `resolveFallbackQueue()` now targets. The two
`new_*_id_here` placeholders remain (see plan.md next priority 2) — `--dry-run` accepts them, a real
deploy will not.

### 4. `soc-cockpit` — lint

```
$ npm run lint
> soc-cockpit@0.1.0 lint
> eslint

(no findings — exit 0)
```

### 5. `soc-cockpit` — unit tests (new)

```
$ npm test
> soc-cockpit@0.1.0 test
> vitest run

 RUN  v1.6.1 /workspace/review/axim-asguard/soc-cockpit

 ✓ tests/ingest-stream.test.ts  (20 tests) 1195ms
 ✓ tests/ingest-auth.test.ts  (7 tests) 156ms

 Test Files  2 passed (2)
      Tests  27 passed (27)
   Duration  31.92s
```

### 6. `soc-cockpit` — build

```
$ NEXT_TELEMETRY_DISABLED=1 npm run build
> next build

 ✓ Compiled successfully in 9.6min
   Linting and checking validity of types ...
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

BUILD_EXIT=0
```

## Environment notes

Two sandbox-specific conditions affected *how* the battery was run; neither changes the result.

- `NODE_ENV=production` is exported in this sandbox, which makes `npm ci` omit devDependencies and
  silently leaves `typescript`/`vitest`/`eslint` uninstalled. All installs here used
  `NODE_ENV=development npm ci --include=dev`.
- The workspace volume is 20 GB and was 91% full; the cockpit tree (1251 packages, `thirdweb` +
  `x402` + `walletconnect`) exhausts it. The npm cache was cleared to make room. This is the reason
  the cockpit build was verified on a cold tree rather than incrementally.

## What was *not* verified locally

- `npx opennextjs-cloudflare build` for the cockpit. It needs an additional ~1 GB of output and the
  volume had 969 MB free after `next build`. Unchanged by this change set; CI and the deploy job
  remain the gate.
- The interceptor was not deployed. `--dry-run` validates the bundle and every binding but performs
  no network call, so it cannot fail on credentials (this is plan.md next priority 4).

---

## Archive — Sprint 28 verification (2026-11-02)

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
