# Changelog

All notable changes to the AXiM Asguard SOC & WAF are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dates are UTC.

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
