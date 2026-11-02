# Asguard Debugging Notes

Known defects, their root causes, and how they were resolved. Newest first.

## 2026-11-02 — Sprint 28 review

### 1. AI classifier timeout was 4s, not the documented 8s

`PROGRESS_LOG.txt` and `plan.md` both claimed "explicit timeout handling (max 8s)" in
`asguard-interceptor/src/aiService.ts`. The live code used `setTimeout(..., 4000)` on the DeepSeek
leg and a second independent 4000ms timer on the Anthropic leg, so a degraded provider pair could
burn 8s of wall clock while each individual call was nominally "bounded".

**Root cause:** the deadline was expressed twice, locally, with no shared constant, and the docs
were written against the intent rather than the implementation.

**Fix:** a single `AI_TIMEOUT_CEILING_MS = 8000` constant plus `fetchWithDeadline()` used by both
legs. A caller-supplied `timeoutMs` is clamped *down* to the ceiling and can never raise it.

### 2. CGI argument injection was not detected at all

`threatEngine.ts` had no rule for `?-d`, `auto_prepend_file`, `auto_append_file`,
`allow_url_include`, `disable_functions` or `safe_mode`. A CVE-2024-4577 style request was only
caught incidentally when the payload happened to contain `php://` (which tripped the generic
traversal rule and was mis-labelled `PATH_TRAVERSAL`). A payload using
`?-d allow_url_include=1` with no `php://` passed through untouched.

**Fix:** a dedicated `CGI_INJECTION` rule evaluated *before* traversal, matching `-d` / `-r` as a
leading query argument plus the dangerous ini directives, including the `%2d` and `%AD`
(soft-hyphen best-fit) encodings used by real exploit tools.

**Regression risk:** an over-eager rule would block legitimate queries. `?-d` is anchored to the
start of the query or to a `&`/`;` separator, so `?q=state-of-the-art` and `?sort=desc&page=2`
still pass — covered by `tests/hardening.test.ts`.

### 3. Double URL-encoding bypassed path traversal detection

`decodeURIComponent(url.search)` was applied exactly once, so `%252e%252e%252f` decoded to
`%2e%2e%2f` and stopped there — the literal `..` never appeared.

**Fix:** each candidate is decoded twice and every marker is tested against raw, single-decoded and
double-decoded forms.

### 4. Blocklist interlock ran *after* threat inspection

`ASGUARD_BLACKLIST` was read third in the pipeline, behind a `THREAT_CACHE` read and a full
`inspectRequest()` pass. A permanently blocked IP still paid for signature scanning on every
request, and the two KV reads were serialised.

**Fix:** both KV namespaces are read in a single `Promise.all` gate before any routing, rate
limiting or body parsing. A hit returns `403` with an explicit `X-Asguard-Action`.

### 5. Telemetry could target `undefined/rest/v1/threat_events`

`logToSupabase` computed `supabaseUrl` with fallbacks (`SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL ||
mock`) but then built `dbUrl` from `env.SUPABASE_URL` directly. Deployments that only set
`NEXT_PUBLIC_SUPABASE_URL` produced `Failed to parse URL from undefined/rest/v1/threat_events` on
every single telemetry write, and every event was lost.

**Fix:** `dbUrl` is derived from the already-resolved `supabaseUrl`.

### 6. Duplicated KV buffer write on the telemetry failure path

`sendTelemetryToCockpit`'s unhandled-rejection handler contained the same
`ASGUARD_KV_BUFFER.put(...)` block twice, writing two entries per dropped event and doubling the
flush backlog.

**Fix:** removed the duplicate.

### 7. SSE proxy route fetched a caller-supplied URL with no validation (SSRF)

`POST /api/ingest/stream` accepted `{ url }` from the request body and fetched it directly. Any
caller could make the cockpit's Worker issue requests to `169.254.169.254`, `10.0.0.0/8`,
`localhost:6543` and so on, and read the response back through the event stream.

**Fix:** `validateUpstreamUrl()` rejects non-HTTP schemes, embedded credentials, loopback / RFC1918
/ link-local / unique-local hosts, `.local` and `.internal` suffixes, and internal infrastructure
ports (6543, 5432, 8080, 9000, 6379, 11211). Rejected targets return `403`.

### 8. SSE disconnect handling could throw into the streaming loop

The old implementation tracked an `isAborted` boolean set by the abort listener and called
`writer.close()` from two places. If the client vanished between the guard check and the write, the
rejection escaped into `startStream()`'s catch and the interval could outlive the request.

**Fix:** a single `createSseChannel()` helper with an idempotent `close()`, guarded writes that
self-close on write failure, `request.signal.aborted` checked at construction time (the abort event
can fire before the listener is attached on Workers), and clear separation between the heartbeat
timer and teardown.

### 9. Realtime feed never actually reconnected

`LiveThreatFeed.tsx` set `streamConnected(false)` on `CLOSED`/`CHANNEL_ERROR` and stopped there.
It also reused the constant channel name `schema-db-changes`, so re-subscribing after a drop handed
back the already-closed channel and the callback never fired again.

**Fix:** a `connect()` / `scheduleReconnect()` pair with a unique channel name per attempt and
backoff of 1s, 2s, 4s, 8s, 16s, 30s (capped). Attempt counter is reset on `SUBSCRIBED`, surfaced in
the UI, and an operator-triggered `Reconnect` button bypasses the wait.

### 10. Gap recovery was dead code

`fetchMissedEvents()` opened with `if (!lastEventTimestamp.current) return;` but nothing ever
assigned `lastEventTimestamp`. Recovery after a reconnect therefore never fetched anything — the
gap in the feed was permanent.

**Fix:** `recordEvent()` now updates `lastEventTimestamp` (and the latency measurement) on every
inbound insert.

### 11. Latency indicator was declared but never driven

`packetLatency` was initialised to `0` and never written, so any badge rendered from it would have
been a permanent hard-coded green.

**Fix:** latency is derived from `Date.now() - event.timestamp`, clamped to 60s, aged forward by a
5s staleness watchdog, and rendered as green (≤2s) / amber (≤10s) / red (>10s) / grey (offline).

### 12. Origin filter was inert

The `appOrigin` `<select>` bound state that no filter clause consumed, so choosing "VendOS"
changed nothing.

**Fix:** origin matching is applied against `appOrigin`, `app_origin`, `metadata.appOrigin` and
`threat_type` in a normalised haystack.

### 13. KV blocklist expiry rendered in 1970

`new Date(block.expiration).toLocaleString()` treated KV's *seconds* epoch as milliseconds.

**Fix:** multiplied by 1000 before formatting.

### 14. No CI existed

There was no `.github/workflows` directory, so "verify GitHub Actions status checks before merge"
had nothing to verify — every merge was effectively untested at the remote.

**Fix:** added `.github/workflows/ci.yml` running `tsc --noEmit`, `npm test` and
`wrangler deploy --dry-run` for the interceptor, and `npm run lint` + `npm run build` for the
cockpit, on every push to `main` and every PR.

### 15. `npm ci` cannot run — lockfile is out of sync

`soc-cockpit/package.json` and `package-lock.json` disagree: the lock is missing
`@hey-api/*`, `commander@15`, `js-yaml@4.2.0` and other transitive entries pulled in by `thirdweb`
and `@x402`. `npm ci` fails with `EUSAGE`, which means CI as provisioned would fail immediately.

**Status:** open. CI currently uses `npm ci`; the lockfile must be regenerated with
`npm install` and committed. Until then, local verification uses `npm install --legacy-peer-deps`.
This is the top follow-up in `plan.md`.

## Earlier notes

- Supabase `.channel()` requires a fresh name per subscription attempt; reuse yields a no-op
  subscribe. Applies to any future realtime hook.
- `@opennextjs/cloudflare` needs `dangerousDisableConfigValidation` while the external-middleware
  override is in use; removing it breaks the Worker bundle.
- Cloudflare KV `expiration` / `expirationTtl` are in **seconds**, not milliseconds.
