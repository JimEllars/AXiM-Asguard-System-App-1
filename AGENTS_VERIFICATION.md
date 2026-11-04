# Agents Verification — Sprint 30 (2026-11-04)

Verification appendix for the daily Asguard SOC review. Every command below was executed locally on
a Node v22.23.4 / npm 10.9.9 host before the branch was pushed.

- Branch: `fix/asguard-proxy-auth-fail-closed-and-sse-teardown`
- Base commit: `068320e` (origin/main — "fix(asguard): enforce a real AI deadline, persist rejected
  telemetry, and cover the cockpit SSE route (#166)")
- Upstream sync: `git fetch origin main` + `git fetch --all --prune`. Exactly one commit landed on
  `origin/main` in the preceding 24h (`068320e`, merged 2026-11-03 17:20Z) and it is the base we
  branched from, so no rebase was required. Eight open PRs, all Dependabot. No human hand-edits
  beyond that merge.

## Scope of this change set

Sprint 29 verified the interceptor's contract and closed the ingest/auth gaps. This pass re-ran the
full battery first (both components were green) and then read the two remaining unguarded surfaces.
Both turned out to be real:

1. **The cockpit's admin proxy was fail-open.** `/api/asguard/[...path]` authorises the writes that
   block and unblock IPs at the edge. Its gate was
   `isSuperUser || (token && jwtSecret) || serviceToken`, where `isSuperUser` came from the
   caller-controlled `x-user-role` **request** header and `serviceToken` was the server's own
   `AXIM_SERVICE_TOKEN`. On any correctly provisioned deployment that last disjunct is always
   truthy, so an anonymous caller reached the interceptor with our service credential attached.
   Two independent bypasses, one gate.
2. **`/api/v1/threats/stream` kept the pre-hardening SSE lifecycle.** Unlike
   `api/ingest/stream/route.ts` it had no `req.signal.aborted` pre-check, so a client that
   disconnected before the handler ran left the 15 s keep-alive interval ticking and never closed
   the writer; `safeWrite` also closed over `cleanup` before it was initialised.

## Files modified

| File | Change | Lines |
| --- | --- | --- |
| `soc-cockpit/src/app/api/asguard/[...path]/route.ts` | New `authorizeAdmin()` — the only authorisation path; derives access from a JWT verified with `ASGUARD_JWT_SECRET` carrying `axim_internal_admin: true`. Dropped the `x-user-role` request-header grant and the `AXIM_SERVICE_TOKEN` disjunct. `serviceToken` is now used solely as the outbound credential and is only attached when actually set | 168 → 194 |
| `soc-cockpit/src/app/api/v1/threats/stream/route.ts` | `req.signal.aborted` pre-check; `cleanup` hoisted above `safeWrite` and made idempotent (interval, channel and writer released exactly once); hydration loop and `subscribe()` abort-guarded; bootstrap rejection path now tears down; added `X-Accel-Buffering: no` and an explicit charset | 105 → 146 |
| `soc-cockpit/tests/asguard-proxy-auth.test.ts` | New suite, 9 tests — anonymous request rejected **with** `AXIM_SERVICE_TOKEN` configured, forged `x-user-role` rejected with and without a cookie, wrong-key JWT, missing secret, non-admin JWT → 403, verified admin passes through, service token attached only after authorisation, unlisted path → 404 | new, 194 |
| `soc-cockpit/tests/threats-stream.test.ts` | New suite, 8 tests — stream headers, ascending hydration order, 15 s keep-alive, already-aborted request closes immediately, abort releases the channel and closes the stream, repeated aborts stay single-shot, no channel opened for a departed client | new, 219 |
| `README.md` | Documented the proxy's single authorisation path (and the two things it no longer trusts) plus the threats-stream lifecycle | 208 → 214 |
| `plan.md` | Sprint 30 recorded; next priorities re-ranked | 116 → 141 |
| `CHANGELOG.md` | Sprint 30 entry | prepended |
| `PROGRESS_LOG.txt` | Sprint 30 entry | prepended |
| `DEBUGGING_NOTES.md` | Two new root-cause notes + one carry-over | prepended |

## Verification battery — verbatim output

### 1. `asguard-interceptor` — typecheck

```
$ npx tsc --noEmit
TSC_OK
```

### 2. `asguard-interceptor` — unit and integration tests

```
$ npm test
> asguard-interceptor@1.0.0 test
> vitest run

 ✓ tests/interceptor.test.ts  (25 tests) 2959ms
 ✓ tests/hardening.test.ts  (31 tests) 1759ms

 Test Files  2 passed (2)
      Tests  56 passed (56)
   Duration  38.24s
```

### 3. `asguard-interceptor` — Wrangler deploy dry-run (binding validation)

```
$ npx wrangler deploy --dry-run
Total Upload: 167.36 KiB / gzip: 30.68 KiB
Your Worker has access to the following bindings:
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

All four KV bindings resolve. The two `new_*_id_here` placeholders remain (see plan.md next
priority 2) — `--dry-run` accepts them, a real deploy will not.

### 4. `soc-cockpit` — lint

```
$ npm run lint
> soc-cockpit@0.1.0 lint
> eslint

(no findings — exit 0)
```

### 5. `soc-cockpit` — unit tests (27 → 44)

```
$ npm test
> soc-cockpit@0.1.0 test
> vitest run

 RUN  v1.6.1 /workspace/review/axim-asguard/soc-cockpit

 ✓ tests/threats-stream.test.ts  (8 tests) 1195ms
 ✓ tests/asguard-proxy-auth.test.ts  (9 tests) 1281ms
 ✓ tests/ingest-stream.test.ts  (20 tests) 225ms
 ✓ tests/ingest-auth.test.ts  (7 tests) 15ms

 Test Files  4 passed (4)
      Tests  44 passed (44)
   Duration  18.00s
```

### 6. `soc-cockpit` — build (post-change)

```
$ npm run build
   ▲ Next.js 15.5.18

 ⚠ Compiled with warnings in 47.7min
   Linting and checking validity of types ...
   Collecting page data ...
 ⚠ Using edge runtime on a page currently disables static generation for that page
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
├ ƒ /submit                              3.15 kB         120 kB

ƒ Middleware                             95.5 kB
```

The single warning is a third-party `Critical dependency: the request of a dependency is an
expression` inside `thirdweb → @base-org/account → @coinbase/cdp-sdk → ox`. It is present on
`origin/main` and is not introduced here.

## Why this cannot lock an operator out

The obvious risk in tightening an auth gate is that it refuses someone who was legitimately getting
in. This change cannot, because it is the *same* predicate the console already uses to render:

`app/layout.tsx` reads the same cookie, verifies it with the same secret and the same algorithm, and
requires the same claim:

```ts
const token = cookieStore.get("asguard_auth_token")?.value;
jwtSecret = getCloudflareContext()?.env?.ASGUARD_JWT_SECRET ?? process.env.ASGUARD_JWT_SECRET;
const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
if (decoded.axim_internal_admin === true) hasAccess = true;
```

`authorizeAdmin()` performs exactly those four steps. So the set of principals who can *reach* the
proxy is, by construction, the set who can already *see* the dashboard and make the browser calls
`LiveThreatFeed` issues to it. Anyone who can currently open the console keeps working; anyone who
cannot was previously reaching the proxy by one of the two bypasses.

The one deployment that does change behaviour is a console reached through `NEXT_PUBLIC_DEMO_MODE`
or `NODE_ENV=development` — both still short-circuit to `fallbackProxy()` before the gate, unchanged.

## Proving the fixes actually fix something

Both suites were run against the `origin/main` versions of the routes before being accepted, to
confirm they fail for the reason claimed rather than passing vacuously.

### Fail-open proxy — 4 of 9 fail on `origin/main`

```
$ git checkout origin/main -- "soc-cockpit/src/app/api/asguard/[...path]/route.ts"
$ npx vitest run tests/asguard-proxy-auth.test.ts

 FAIL  > rejects an anonymous request even when AXIM_SERVICE_TOKEN is configured
       AssertionError: expected 200 to be 401
 FAIL  > does not treat the inbound x-user-role header as a credential
       AssertionError: expected 200 to be 401
 FAIL  > rejects a forged x-user-role header sent alongside an unsigned cookie
       AssertionError: expected 200 to be 401
 FAIL  > fails closed when ASGUARD_JWT_SECRET is not configured
       AssertionError: expected 200 to be 401

      Tests  4 failed | 5 passed (9)
```

`200`, not `401` — an unauthenticated `GET /api/asguard/blocklist` returned the live edge
blocklist and an unauthenticated `POST` was forwarded to the interceptor.

### SSE lifecycle — 4 of 8 fail on `origin/main`

```
$ git checkout origin/main -- soc-cockpit/src/app/api/v1/threats/stream/route.ts
$ npx vitest run tests/threats-stream.test.ts

 FAIL  > advertises an unbuffered, non-cacheable event stream
       AssertionError: expected null to be 'no'
 FAIL  > closes immediately when the client disconnected before the handler ran
       AssertionError: promise rejected "Error: stream read timed out — teardown never ran"
 FAIL  > never subscribes when the client vanished mid-hydration
       AssertionError: expected 1 to be +0
 FAIL  > does not start a realtime channel when the client is already gone

      Tests  4 failed | 4 passed (8)
```

The read timeout is the leak itself: on `origin/main` the already-aborted stream never closes.

## Baseline health audit (pre-change, on `origin/main`)

| Check | Result |
| --- | --- |
| `soc-cockpit` `npm run lint` | clean |
| `soc-cockpit` `npm test` | 27 passed |
| `soc-cockpit` `npm run build` | passed (20.4 min, cold run, before any change) |
| `asguard-interceptor` `npx tsc --noEmit` | clean |
| `asguard-interceptor` `npm test` | 56 passed |
| `asguard-interceptor` `npx wrangler deploy --dry-run` | passed, 4 KV bindings |

Nothing was broken on arrival, so Step 3 of the runbook did not require a repair freeze.

## Open-PR audit

Eight Dependabot PRs, none from a human. Four are `UNSTABLE` on `cockpit (lint + build)`: **#169**
(tinypool/vitest), **#168** (vite/vitest), **#161** (zod 3 → 4), **#158**
(`@opennextjs/cloudflare` 1.20.2). All four fail identically at `npm ci` in ~8 s, not at lint or
build:

```
npm error Missing: zod@3.25.76 from lock file   (repeated)
npm error Clean install a project
```

Their `soc-cockpit/package-lock.json` is out of sync with `soc-cockpit/package.json` because each
branch was cut from an older `main` and Dependabot rebuilt the lockfile without the intervening
zod pin. Fixing them means regenerating four lockfiles; that is a separate change set and would
have mixed dependency churn into a security fix, so it is logged as the top follow-up in `plan.md`
rather than bundled here. `origin/main` itself is in sync — CI on #166 was green.

The other four (#165 follow-redirects, #164 qs, #162 undici/wrangler, #159 vite) report `CLEAN`.

## Carried-over follow-ups (unchanged, tracked in plan.md)

- `wrangler` is not a declared devDependency of `asguard-interceptor`, so CI's
  `npx wrangler deploy --dry-run` resolves it at job time. It works (interceptor job: 26 s) but the
  version is unpinned. Fixing it means bumping `@cloudflare/workers-types` 4 → 5 to satisfy
  wrangler's peer, which is a dependency change of its own.
- `ASGUARD_KV_BUFFER` and `THREAT_CACHE` still carry `new_*_id_here` placeholders in
  `wrangler.toml`.
- The `rcePatterns` rule in `threatEngine.ts` treats a bare `;` or `|` in the path or query string
  as CRITICAL. That is fail-closed by design but will 403 legitimate traffic such as `?a=1;b=2`.
  Tightening it is a detection-tuning decision, so it is documented in `DEBUGGING_NOTES.md` for the
  operator rather than changed unilaterally.

## Environment notes

- The host has 3.9 GB RAM and was heavily contended throughout this run (`load average` held at
  5-9, `%st` — CPU steal — sat at 82%). The first `npm run build` attempt was killed by a 900 s tool
  timeout at the "Creating an optimized production build" stage and looked exactly like a hang; it
  was not. The same build completed in 20.4 min before any change and 47.7 min after, with the
  allocation to the webpack worker running at 0.1-13% CPU and climbing steadily throughout. Nothing
  in the change set touches the webpack graph. **The runbook's build gate needs a multi-hour timeout
  on this host** — a 15-minute timeout will produce a false "broken build" verdict.
- `wrangler` is not installed in `asguard-interceptor/node_modules`; the dry-run was executed via
  `npx --yes wrangler@4.109.0`, matching what CI does.

---

## Archive — Sprint 29 (2026-11-03)

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
