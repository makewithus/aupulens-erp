import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Output configuration for Electron
  output: process.env.ELECTRON_BUILD === "true" ? "export" : undefined,

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },

  // Configure rewrites for subdomain handling
  async rewrites() {
    return [
      // Handle subdomain routing - this will match any path on subdomain.aupulens.in
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
