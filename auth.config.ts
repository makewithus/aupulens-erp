import type { NextAuthConfig } from "next-auth";

if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET =
    process.env.NEXTAUTH_SECRET ||
    "5e4f8b3a7c1d9e2f6a8b0c4d7e9f1a3b5c7d8e0f2a4b6c8d1e3f5a7b9c0d2e4";
}

if (!process.env.AUTH_TRUST_HOST) {
  process.env.AUTH_TRUST_HOST = "true";
}

const isProd = process.env.NODE_ENV === "production";

const getCookieDomain = () => {
  if (!isProd) {
    return undefined; // Localhost and dev environments should use host-only cookies
  }

  const appUrl = process.env.COOKIE_DOMAIN || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      const hostname = new URL(appUrl).hostname;
      if (
        hostname.includes("localhost") ||
        hostname === "127.0.0.1" ||
        hostname.endsWith(".vercel.app")
      ) {
        return undefined;
      }
      const parts = hostname.split(".");
      if (parts.length >= 2) {
        return `.${parts.slice(-2).join(".")}`;
      }
    } catch {
      const cleaned = appUrl.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
      if (
        cleaned.includes("localhost") ||
        cleaned === "127.0.0.1" ||
        cleaned.endsWith(".vercel.app")
      ) {
        return undefined;
      }
      const parts = cleaned.split(".");
      if (parts.length >= 2) {
        return `.${parts.slice(-2).join(".")}`;
      }
    }
  }

  return undefined; // Let NextAuth handle host-only cookies if no explicit domain is found
};

export const authConfig = {
  pages: {
    signIn: "/auth/admin",
    error: "/auth/admin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && token.role) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      return url;
    },
  },
  session: {
    strategy: "jwt",
    // JWT token validity: 8 hours. If the user is active, token is refreshed.
    // Cookie has NO maxAge (see below) so it is a browser SESSION cookie —
    // it is deleted the moment the browser is closed, ensuring fresh opens
    // always require login.
    maxAge: 8 * 60 * 60,   // 8 h server-side JWT validity
    updateAge: 60 * 60,    // refresh every 1 h of active use
  },
  // We remove the explicit `cookies` override. NextAuth (Auth.js v5) automatically 
  // uses the `__Secure-` prefix on HTTPS and strips it on HTTP.
  // It will also use host-only cookies (domain=undefined) by default, 
  // which works perfectly across most proxy and localhost setups.
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [], // Providers are configured in auth.ts
} satisfies NextAuthConfig;
