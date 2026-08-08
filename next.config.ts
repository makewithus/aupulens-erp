import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
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
      "img-src 'self' data: blob:",
      "connect-src 'self' https://api.anthropic.com",
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
