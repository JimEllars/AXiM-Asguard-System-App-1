# Asguard Debugging Notes

Known defects, their root causes, and how they were resolved. Newest first.

## 2026-11-03 — Sprint 29 review

### 1. The "8-second timeout" was two 8-second timeouts, and neither covered the body

Sprint 28 replaced two 4000ms timers with `AI_TIMEOUT_CEILING_MS = 8000` and a shared-looking
`fetchWithDeadline()` helper, and both `plan.md` and the changelog described it as "a single
8-second deadline shared by both provider legs". It was not shared: `generate()` called
`fetchWithDeadline()` separately for DeepSeek and again for Anthropic, each time passing the full
ceiling. A primary that hung to its limit followed by a failover that hung to its limit consumed
~16s.

There was a second, worse hole. `fetchWithDeadline()` was:

```ts
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  return await fetch(url, { ...init, signal: controller.signal });
} finally {
  clearTimeout(timer);      // <- released once HEADERS arrive
}
```

The timer is cleared when the promise from `fetch()` resolves — which happens as soon as response
headers are received, long before the body is read. Every caller then did
`await response.text()` with no deadline attached. A provider that answers `200 OK` with the right
`Content-Type` and then never sends a body would hold the classifier open until the platform killed
the isolate. The first was a documentation defect; the second was a live hang.

**Fix:** `createDeadline()` returns an absolute epoch timestamp plus `remaining()`. Every leg —
primary, failover, and each body read — draws from that one clock
(`requestWithinDeadline(url, init, deadline, stage)`), and the abort timer is only released by an
explicit `disarm()` in a `finally` that runs *after* the body has been consumed. Two behaviours fall
out of it:

- Total wall clock is bounded by the ceiling, which is what actually protects the request.
- `PRIMARY_LEG_BUDGET_SHARE = 0.6` caps the primary leg at 60% of the ceiling. Without it, a hung
  primary consumes the entire budget and the Anthropic failover is never dialled — the deadline
  would be respected but the redundancy silently lost.

**Regression coverage:** `bounds the body read, not just the header wait` (enqueues a `200` with a
`ReadableStream` that never closes and asserts the degraded payload arrives inside the budget) and
`spends one shared budget across both provider legs` (both legs hang; asserts two fetch calls and
elapsed < ceiling × 1.5).

### 2. Telemetry rejected by Supabase was written to a namespace nothing reads

Four buffering sites in `telemetry.ts` wrote to `env.TELEMETRY_FALLBACK_QUEUE`:

```ts
if (env.TELEMETRY_FALLBACK_QUEUE) {
  env.TELEMETRY_FALLBACK_QUEUE.put(`fallback_evt:${Date.now()}`, ...)
}
```

`wrangler.toml` declares `ASGUARD_KV_BUFFER`, `ASGUARD_BLACKLIST`, `ASGUARD_TELEMETRY` and
`THREAT_CACHE`. There is no `TELEMETRY_FALLBACK_QUEUE` binding anywhere in the repository. The
guard `if (env.TELEMETRY_FALLBACK_QUEUE)` was therefore false in production, so the entire branch —
the only thing standing between a Supabase outage and permanent event loss — never executed.

Meanwhile `flushBufferedTelemetry()` read from `env.TELEMETRY_FALLBACK_QUEUE || env.ASGUARD_TELEMETRY`.
So the reader was pointed at a namespace the writer never wrote to, and even the fallback was the
wrong one: `sendTelemetryToCockpit()` buffered into `ASGUARD_KV_BUFFER`, which the flush never
scanned. Three functions, three different ideas of where the buffer lives.

**Root cause:** the binding was renamed at some point and only some call sites followed.

**Fix:** one resolver, `resolveFallbackQueue(env)` — `TELEMETRY_FALLBACK_QUEUE` (kept for
deployments that may have added it by hand) → `ASGUARD_KV_BUFFER` (the binding that exists) →
`ASGUARD_TELEMETRY`. All writes go through `bufferFailedEvent()`, which logs loudly when no namespace
is bound instead of skipping silently. The `Env` interface now declares the namespace so the compiler
would have caught the mismatch.

**Lesson:** an `if (env.BINDING)` guard around the *only* error-handling path is indistinguishable
from correct code until the error actually happens. `wrangler deploy --dry-run` prints the real
binding list — that output is the cheapest place to catch this class of bug.

### 3. The backlog flush still had the `SUPABASE_URL`-only bug

Sprint 28 fixed `logToSupabase()` to derive its URL from the resolved value, because a
`NEXT_PUBLIC_SUPABASE_URL`-only deployment was POSTing to `undefined/rest/v1/threat_events`.
`flushBufferedTelemetry()` — ten lines of the same shape, reading the same env — was missed:

```ts
const dbUrl = env.SUPABASE_URL ? `${env.SUPABASE_URL}/rest/v1/threat_events`
                               : 'http://localhost:54321/rest/v1/threat_events';
```

With only the public name configured, every replayed backlog went to localhost, failed, and the
`else` branch deleted nothing — but the flush logged a bare status code and returned, so the backlog
grew. It now resolves both names, refuses to attempt a flush with no URL at all (retaining the
entries), and bounds the request with `TELEMETRY_WRITE_TIMEOUT_MS`.

### 4. Cockpit ingest authenticated against a token printed in the source tree

```ts
const expectedKey = process.env.ASGUARD_API_KEY || 'default_ingest_token';
```

If `ASGUARD_API_KEY` was unset on the cockpit deployment, the shared secret became the literal string
`default_ingest_token` — which is committed to the repository and would be visible in any private
repo, but in an *unset* deployment it is not a downgrade at all, it is a public password. That route
writes rows into `threat_events`, the table behind the live threat feed, the severity filters and the
operator dashboard. The attack is telemetry poisoning: inject `verdict: 'allow'` rows to bury real
blocks, or `threat_score: 99` rows on an innocent IP to burn an analyst's afternoon — or to bait a
`Drop IP` click that blacklists a legitimate customer.

The interceptor's `sendTelemetryToCockpit()` used the same fallback, which made the pair *appear*
consistent while both were unauthenticated.

**Fix:** fail closed. No configured secret → `503 ingest_not_configured` with an explicit error log;
mismatch → `401`. The comparison is `safeEqual()`, constant-time over the longer of the two inputs
so a caller cannot infer the secret's length from response timing. The interceptor no longer guesses:
it detects the missing key, logs it, and buffers the event for replay rather than entering a 401
retry loop against a fail-closed cockpit.

**Deployment consequence:** any environment that was relying on the default token will start
returning `503` on ingest until `ASGUARD_API_KEY` is set on *both* Workers. That is the intended
behaviour — but it is a breaking change for a misconfigured deployment, so it is called out in the
README operating notes.

### 5. The cockpit's SSE route had zero automated coverage

`/api/ingest/stream` is the only route carrying a live operator data path, and the Sprint 28 rewrite
(15s heartbeats, abort teardown, SSRF guard) was verified by hand. `soc-cockpit` had no test runner
at all, and CI only ran `lint` + `build` for it, so a regression in the SSRF guard would have
deployed silently.

**Fix:** `vitest` added to `soc-cockpit` with 20 tests, and a `Unit tests` step in the CI cockpit job
between lint and build. The SSRF cases assert `fetch` was never called, not merely that the status
was `403` — a guard that fetches first and rejects after would pass the weaker assertion.

### 6. Known-but-unfixed: cockpit ingest fans out to its own proxy route

`/api/ingest` ends with:

```ts
await fetch(`${streamBase}/api/ingest/stream`, { method: 'POST', body: JSON.stringify({...validatedData, id}) })
```

But `POST /api/ingest/stream` is the *SSRF-validated proxy*: it requires `{ url, headers, body }` and
returns `400 Bad Request` when `url` is absent. The broadcast therefore cannot succeed; the failure is
swallowed by the surrounding `catch`, so the only symptom is a missing realtime push. It is also a
synchronous `await` on the ingest hot path, so every ingest pays for a round-trip that always fails.

A correct fan-out needs a publish/subscribe primitive that spans isolates — a Durable Object or a
Queue — not `fetch` back into the same Worker. Deferred rather than half-implemented: an in-memory
subscriber set would appear to work in local dev and silently miss every cross-isolate subscriber in
production. Tracked as plan.md next priority 3.

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
