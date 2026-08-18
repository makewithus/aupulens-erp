import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Allow the microphone for our OWN origin (self) — the AI voice-to-text
    // feature needs it. Previously "microphone=()" disabled it for everyone,
    // which made getUserMedia throw NotAllowedError even after the user granted
    // browser permission. Camera/geolocation/payment stay disabled (unused).
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // res.cloudinary.com serves back uploaded files/previews (the Document
      // Upload feature and every form's file-attachment field use Cloudinary).
      "img-src 'self' data: blob: https://res.cloudinary.com",
      // api.cloudinary.com is where the browser uploads files DIRECTLY (no
      // Next.js API route in between — see lib/upload.ts). Without it here,
      // every Cloudinary upload across the app (Documentation, customer/
      // subscription/sales-order/invoice attachments) silently fails with the
      // browser's generic "Failed to fetch" — the request never leaves the
      // page, so the server-side code is never at fault.
      "connect-src 'self' https://api.anthropic.com https://api.cloudinary.com",
      "frame-src 'self' https://www.youtube.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: process.env.ELECTRON_BUILD === "true" ? "export" : undefined,
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Keep these Node-only document parsers OUT of the webpack server bundle.
  // Bundling pdf-parse (pdf.js) / mammoth mangles their module init and throws
  // "Object.defineProperty called on non-object" at runtime — reading a PDF/DOCX
  // then fails. Marking them external makes them load as normal Node modules.
  serverExternalPackages: ["pdf-parse", "mammoth"],

  images: {
    unoptimized: true,
  },

  // Silence the benign jose Edge-Runtime warning. The auth middleware runs on
  // the Edge runtime and must decode the JWT session via `jose`; jose's entry
  // statically pulls in its deflate helper (CompressionStream /
  // DecompressionStream), but that code path — compressed JWE ("zip") — is
  // never exercised by NextAuth. Next's Edge linter flags the unused API as a
  // false positive. Scoped tightly to jose's deflate module + that exact
  // message so genuine "Node.js API in the Edge Runtime" warnings still surface.
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      (warning: any) => {
        const msg = typeof warning?.message === "string" ? warning.message : "";
        const res = String(
          warning?.module?.resource || warning?.module?.userRequest || "",
        );
        return (
          (/Edge Runtime/.test(msg) &&
            /(CompressionStream|DecompressionStream)/.test(msg)) ||
          /[\\/]jose[\\/].*[\\/]deflate\.js$/.test(res)
        );
      },
    ];
    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/:path*",
        destination: "/:path*",
        has: [
          {
            type: "host",
            value: "(?<subdomain>.+).aupulens.(in|online)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
