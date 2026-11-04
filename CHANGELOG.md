# Changelog

All notable changes to the AXiM Asguard SOC & WAF are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dates are UTC.

## [Unreleased] — 2026-11-04 (Sprint 30)

### Security

- **The cockpit's edge-admin proxy is no longer fail-open.** `/api/asguard/[...path]` fronts
  `GET/POST/DELETE /api/asguard/blocklist` — the calls that block an IP at the edge, lift an
  existing block, and export the audit trail. Its gate read
  `isSuperUser || (token && jwtSecret) || serviceToken` and accepted two things that are not caller
  credentials. `isSuperUser` was derived from the `x-user-role` **request** header, which
  `middleware.ts` only ever writes to the outgoing *response*, so anything a client sent reached the
  handler verbatim and `x-user-role: super_user` was a super-user grant. `serviceToken` was our own
  outbound `AXIM_SERVICE_TOKEN`, so simply having it configured — a required production variable —
  authorised every request, and the proxy then attached that token to the upstream call on the
  caller's behalf. Either bypass alone exposed blocklist writes; together they made a credential-free
  `POST /api/asguard/blocklist` reachable. Authorisation now rests on one proof: a JWT in the
  `asguard_auth_token` cookie, verified with `ASGUARD_JWT_SECRET`, carrying
  `axim_internal_admin: true` — the same claim `app/layout.tsx` uses to decide whether the console
  renders. No session or no secret → `401`; verified but not an admin → `403`; everything else is
  rejected before any upstream fetch.
- **`AXIM_SERVICE_TOKEN` is used only as what it is.** It is attached to the outbound interceptor
  request after the caller has been authorised, and only when it is actually set —
  `Headers.set(name, undefined)` serialises to the literal string `"undefined"`, which the
  interceptor would have compared as a wrong token instead of reading as absent.

### Fixed

- **`/api/v1/threats/stream` no longer leaks an isolate-long heartbeat.** The second SSE channel in
  the cockpit was hardened later than `api/ingest/stream/route.ts` and kept the older lifecycle. It
  had no `req.signal.aborted` pre-check, so a client that disconnected before the handler ran never
  fired an `abort` event: the 15 s keep-alive interval ticked for the lifetime of the isolate, the
  writer never closed, and a realtime Supabase channel was opened for a caller that had already
  gone. It now checks the flag rather than only the listener, exactly as the ingest route does.
- **Threat-stream teardown is single-shot and cannot double-close.** `cleanup` was a `const` arrow
  declared *after* the `safeWrite` callback that called it — a temporal-dead-zone trap rather than a
  working guard. It is hoisted above its callers and made idempotent, releasing the interval, the
  realtime channel and the writer exactly once. Repeated aborts are harmless, and a rejected
  bootstrap now tears down instead of leaving the channel orphaned.
- **Hydration and subscription both respect a closed stream.** The hydration loop stops writing the
  moment teardown runs, and `subscribe()` returns early rather than creating a channel for a
  departed client.
- **The threats stream advertises the same transport guarantees as the ingest stream**: explicit
  `charset=utf-8`, `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`.

### Added

- `soc-cockpit/tests/asguard-proxy-auth.test.ts` — 9 tests pinning the fail-closed admin contract.
  Four of them return `200` instead of `401` against the previous implementation.
- `soc-cockpit/tests/threats-stream.test.ts` — 8 tests covering transport headers, ascending
  hydration order, the 15 s heartbeat, and the four teardown paths. Four fail against the previous
  implementation, one by timing out on the leaked stream.
- Cockpit suite: 27 → 44 tests. Interceptor suite unchanged at 56 (no interceptor source changed).

## [Unreleased] — 2026-11-03 (Sprint 29)

### Fixed

- **The AI budget is now a real deadline, not two independent timers.** `AIClient.generate()` used
  to hand each provider leg its own fresh `AI_TIMEOUT_CEILING_MS` (8s), so a hung DeepSeek followed
  by a hung Anthropic cost ~16s — double the documented contract. Both legs now draw from one
  absolute clock (`createDeadline()`); the primary leg is capped at
  `PRIMARY_LEG_BUDGET_SHARE = 0.6` of the ceiling so failover always has budget left, and anything
  still outstanding after 8s returns the deterministic fallback payload.
- **The deadline survives the response body read.** `fetchWithDeadline()` cleared its abort timer as
  soon as headers arrived, leaving `await response.text()` completely unbounded — a provider that
  answered `200` and then stalled its body hung the classifier indefinitely. The timer now stays
  armed until the body has actually been consumed (`requestWithinDeadline()` + `disarm()`).
- **Telemetry rejected by Supabase is no longer discarded.** The failure paths buffered into
  `TELEMETRY_FALLBACK_QUEUE`, which `wrangler.toml` does not declare, while
  `flushBufferedTelemetry()` scanned `ASGUARD_TELEMETRY`. Nothing was ever written to the namespace
  being read. `resolveFallbackQueue()` now prefers `TELEMETRY_FALLBACK_QUEUE`, then
  `ASGUARD_KV_BUFFER` (the binding that actually exists), then `ASGUARD_TELEMETRY`, and both the
  write and flush sides use it. A missing namespace is logged instead of failing silently.
- **Buffered telemetry flushes to the right host.** `flushBufferedTelemetry()` still read only
  `env.SUPABASE_URL`, so a `NEXT_PUBLIC_SUPABASE_URL`-only deployment replayed backlog to
  `undefined/rest/v1/threat_events` — the same defect fixed on the write path in Sprint 28, one
  function over. It now resolves both names, refuses to flush without a URL, and retains the entries
  instead of deleting data it failed to deliver.
- **Cockpit ingest no longer honours a published default token.** `/api/ingest` compared the bearer
  against `process.env.ASGUARD_API_KEY || 'default_ingest_token'`; with the variable unset, anyone
  could authenticate with a literal that is in the source tree and plant fabricated `verdict` /
  `threat_score` rows in the operator dashboard. Unconfigured now returns
  `503 ingest_not_configured`; mismatch returns `401`; the comparison no longer short-circuits on
  length.
- **`sendTelemetryToCockpit()` stops guessing a secret.** It used the same `default_ingest_token`
  fallback, which against a fail-closed cockpit becomes a silent 401 retry loop. It now detects the
  missing `ASGUARD_API_KEY`, logs it, and buffers the event for replay.
- **Bounded the remaining unbounded telemetry legs.** The `AXIM_CORE_INGEST_URL` dispatch and the
  backlog flush had no timeout of their own; both now use `TELEMETRY_WRITE_TIMEOUT_MS` (1500ms).

### Added

- **Automated coverage for the cockpit SSE route** (`soc-cockpit/tests/ingest-stream.test.ts`,
  20 tests) — previously zero. Covers the `text/event-stream` headers, the 15s `: keep-alive`
  cadence, clean close on client disconnect, immediate close when the request arrives already
  aborted, thirteen SSRF rejections (loopback, RFC1918, link-local, metadata hosts, ULA, internal
  ports, `file://`, embedded credentials) each asserting the upstream was never fetched, and
  re-framing of a proxied upstream with its keep-alives stripped.
- `vitest` in `soc-cockpit` (`npm test`) and a `Unit tests` step in the CI cockpit job, between lint
  and build.
- 7 new interceptor tests: body-read deadline bound, single shared budget across both legs, failover
  budget reservation, and fallback-queue resolution / persistence / flush / no-URL guard.
- `soc-cockpit/tests/ingest-auth.test.ts` (7 tests) pinning the fail-closed ingest contract,
  including that the old `default_ingest_token` literal no longer authenticates anything.

### Changed

- `AIClient.generate()` additionally reports `deadlineMs` and `elapsedMs` so callers can assert the
  budget without re-deriving it.
- `Env` now declares `ASGUARD_KV_BUFFER`, an optional `TELEMETRY_FALLBACK_QUEUE`, and the
  SUPABASE/AXIM ingest variables that the code already read.

## [Unreleased] — 2026-11-02 (Sprint 28)

### Added

- **CGI argument injection defence.** `threatEngine.ts` now detects the CVE-2024-4577 family
  (`?-d`, `-r`, `auto_prepend_file`, `auto_append_file`, `allow_url_include`, `disable_functions`,
  `safe_mode`, `open_basedir`), including the `%2d` / `%AD` soft-hyphen encodings used by real
  exploit tooling. Classified `CGI_INJECTION`, severity CRITICAL, `403`.
- **PHP shell probe defence.** `.php`, `.phtml`, `.phar` and `/wp-admin` targets are classified
  `PHP_SHELL_PROBE` and rejected with `403`.
- **SSRF guard on the SSE proxy.** `POST /api/ingest/stream` now validates the caller-supplied
  upstream URL: HTTP(S) only, no embedded credentials, no loopback / RFC1918 / link-local /
  unique-local hosts, no `.local` or `.internal`, no internal infrastructure ports
  (6543, 5432, 8080, 9000, 6379, 11211). Rejections return `403`.
- **CI pipeline.** `.github/workflows/ci.yml` runs `tsc --noEmit`, `npm test` and
  `wrangler deploy --dry-run` for the interceptor, plus `npm run lint` and `npm run build` for the
  cockpit, on every push to `main` and every pull request. The repository previously had no CI.
- **Regression suites.** `asguard-interceptor/tests/hardening.test.ts` (24 tests) covering CGI
  injection, double-encoded traversal, PHP probes, the blocklist interlock, and AI timeout isolation.
- `DEBUGGING_NOTES.md`, `AGENTS_VERIFICATION.md`, this changelog.

### Changed

- **AI classifier deadline raised to a true 8s.** `AI_TIMEOUT_CEILING_MS = 8000`, shared by both the
  DeepSeek and Anthropic legs through a single `fetchWithDeadline()` helper. A caller-supplied
  `timeoutMs` is clamped down to the ceiling and can never raise it. Previously each leg had its own
  independent 4000ms timer, so a degraded provider pair could consume 8s with no single bounded call.
- **Deterministic fallback is stream-shaped when appropriate.** Degraded classification now emits a
  well-formed SSE `data:` frame (`X-Asguard-Degraded: true`) on the streaming path instead of a bare
  JSON body that an SSE parser would choke on.
- **Global blocklist interlock is now the first thing that runs.** `THREAT_CACHE` and
  `ASGUARD_BLACKLIST` are read in one `Promise.all` before routing, rate limiting or body parsing,
  and the response carries `X-Asguard-Action: blocked-blacklist | blocked-edge-kv`.
- **Threat verdicts are attributed.** Threat-engine rejections return
  `X-Asguard-Action: blocked-threat-engine` plus `X-Asguard-Threat-Category`.
- **SSE channels rebuilt** around a single `createSseChannel()` helper: 15s `: keep-alive\n\n`
  heartbeats, `request.signal.aborted` checked at construction time, guarded writes that self-close,
  and idempotent teardown.
- **Realtime feed reconnects.** Exponential backoff 1s → 30s capped, unique channel name per
  attempt, attempt counter reset on `SUBSCRIBED`, manual `Reconnect` control.
- **Telemetry URL construction fixed.** `logToSupabase` derives its REST endpoint from the resolved
  URL, so `NEXT_PUBLIC_SUPABASE_URL`-only deployments no longer write to
  `undefined/rest/v1/threat_events`.
- **`ctx` threaded into AI telemetry.** The `/analysis` path passes its `ExecutionContext` through to
  `logAIInference`, so inference telemetry is dispatched with `ctx.waitUntil()` rather than fire-and-
  forget.
- **Latency indicator is real.** `LiveThreatFeed` derives delivery lag from
  `Date.now() - event.timestamp`, clamps it to 60s, ages it forward on a 5s watchdog, and renders
  green (≤2s) / amber (≤10s) / red (>10s) / grey (offline).
- **`soc-cockpit/package-lock.json` regenerated.** The lock was out of sync with `package.json`
  (`@hey-api/*`, `c12`, `commander@15`, `js-yaml@4.2.0` and nine other transitive entries missing),
  so `npm ci` failed with `EUSAGE` and the new CI job could never pass on a clean runner. The lock
  now holds 1390 entries and `npm ci --include=dev` completes (1251 packages).

### Fixed

- **`README.md` rewritten** for the canonical Asguard SOC & WAF architecture. The legacy
  "ENGINEERING-BRIEFING--AXiM-Public-Frontend---Web3-6337 / Repository created by Greta" header is
  gone.
- Duplicated `ASGUARD_KV_BUFFER.put()` on the telemetry failure path (two entries per dropped event).
- `lastEventTimestamp` was never assigned, so realtime gap recovery after a reconnect silently did
  nothing.
- The `appOrigin` filter in the cockpit bound state no block ever read; selecting an origin had no
  effect.
- KV blocklist expiry was formatted as milliseconds, rendering entries as 1970.
- `formatTimestamp`/`asText` guard every rendered field, so a partial `threat_events` row can no
  longer throw during render.
- Removed committed runtime scratch: `dev_pid.txt`, `nextjs.pid`, `test-results/`. All three are now
  gitignored.

### Known issues

- Dependabot PRs #158–#162 remain open. #161 (`zod` 3 → 4 in the cockpit) removes
  `z.string().ip()`, which the interceptor's `TelemetryPayloadSchema` still uses; the two must move
  together.
- `asguard-interceptor/wrangler.toml` still carries placeholder KV IDs (`new_buffer_id_here`,
  `new_threat_cache_id_here`). `--dry-run` accepts them; a real deploy will not.
- The SSE proxy's SSRF guard rejects literal private hosts but cannot defeat DNS rebinding — a
  hostname resolving to a private address still passes, because Workers cannot resolve DNS before
  `fetch`. An egress allowlist is the durable fix.
