This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Secure deployment

The cockpit uses a Cloudflare service binding to access `asguard-interceptor`; it never exposes
an Asguard administrative credential to the browser. Configure these Cockpit Worker secrets:

- `AXIM_SERVICE_TOKEN`: must exactly match the Interceptor's `ASGUARD_SERVICE_TOKEN`.
- `ASGUARD_JWT_SECRET`: the AXiM-issued HS256 JWT signing secret. Cockpit access requires a
  verified `asguard_auth_token` with `axim_internal_admin: true`.

Configure the Interceptor with `ASGUARD_SERVICE_TOKEN`, `TELEMETRY_INGEST_KEY`,
`DEEPSEEK_API_KEY`, and `ANTHROPIC_API_KEY`. AXiM workloads must send
`X-Asguard-Ingest-Key` when posting telemetry.

## Local Setup

Copy the example environment variables:
`cp .env.example .env.local`

Do not configure `NEXT_PUBLIC_ASGUARD_API_KEY`; browser clients use the authenticated
`/api/asguard/*` proxy.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
