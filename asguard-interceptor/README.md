# asguard-interceptor

A lightweight Cloudflare Worker interceptor for Asguard.

## Setup

Run `npm install` to install dependencies.

Use `./setup-secrets.sh` to configure the `UPSTREAM_API_TOKEN` and other secrets.

To set up the ASGUARD_API_KEY for local development, run:
`npx wrangler secret put ASGUARD_API_KEY`

## Commands

- `npm run test` - Run unit tests
- `npm run build` - Build the worker
