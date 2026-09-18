# asguard-interceptor

A lightweight Cloudflare Worker interceptor for Asguard.

## Setup

Run `npm install` to install dependencies.

Use `./setup-secrets.sh` to configure the Worker secrets. It prompts securely for:

- `ASGUARD_API_KEY` for direct administrative clients
- `ASGUARD_SERVICE_TOKEN` for the SOC Cockpit Worker-to-Worker binding
- `TELEMETRY_INGEST_KEY` for AXiM services sending telemetry
- `DEEPSEEK_API_KEY` (primary) and `ANTHROPIC_API_KEY` (fallback) for `POST /analysis`

`POST /telemetry` and `/telemetry/client-error` require `X-Asguard-Ingest-Key`.
Administrative endpoints (`GET /telemetry`, `/audit`, and `/blocklist`, blocklist mutations,
and `POST /analysis`) require either `X-Asguard-Auth` or the internal
`X-Asguard-Service-Token`. The analysis endpoint accepts a telemetry payload and uses DeepSeek
first, automatically falling back to Anthropic when DeepSeek is unavailable.

## Commands

- `npm run test` - Run unit tests
- `npm run build` - Build the worker
