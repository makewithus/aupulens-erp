This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 🚀 Aupulens ERP

A comprehensive Enterprise Resource Planning system built with Next.js, featuring multi-role dashboards for Admin, Finance, Sales, Inventory, and Manufacturing management.

## 🖥️ Desktop Application

This ERP can run both as a **web application** and as a **desktop application** using Electron!

### Run as Desktop App
```bash
npm run electron:dev
```

### Build Desktop Installer
```bash
npm run electron:build:win   # Windows
npm run electron:build:mac   # macOS
npm run electron:build:linux # Linux
```

## 🌐 Getting Started (Web App)

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

## 🔧 Environment Variables

Copy `.env.example` to `.env` and fill in the values. The app-URL variables (see `lib/config.ts`) control how tenant links and API calls are built — nothing in the app should hardcode a host:

| Variable | Purpose | Dev default | Production |
|---|---|---|---|
| `NEXT_PUBLIC_APP_ROOT_DOMAIN` | Root domain tenants live under (`{subdomain}.<this>`) | `aupulens.online` | Set to your real root domain if different |
| `NEXT_PUBLIC_APP_BASE_URL` | Base URL of the marketing/default-tenant site, used for redirects | `https://aupulens.online` | Must match your deployed origin |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Support address shown in suspended/error states | `support@aupulens.online` | Set to your real support inbox |
| `NEXT_PUBLIC_API_BASE_URL` | Absolute API origin for callers that can't use relative paths (e.g. the packaged Electron app) | empty (same-origin) | Set only if the client is served from a different origin than the API |
| `ELECTRON_DEV_SERVER_URL` | Dev server the Electron shell loads when `NODE_ENV=development` | `http://localhost:3000` | Not used in production builds (loads bundled `out/`) |

Same-origin browser code should always call the API with a relative path (`fetch("/api/...")`) rather than prepending any of these.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
