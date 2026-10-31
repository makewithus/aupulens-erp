import type { NextAuthConfig } from "next-auth";
import { getTenantSessionPolicyVersion, tenantSessionStaleReason } from "@/lib/auth/sessionPolicy";

if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET must be set in production");
  } else {
    // Keep this stable across Next.js route and middleware bundles. A random
    // value per module load makes /csrf tokens unverifiable by /signout during
    // dev/HMR, leaving users unable to log out.
    process.env.AUTH_SECRET = "aupulens-local-development-auth-secret-v1";
  }
} else if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;
}

if (!process.env.AUTH_TRUST_HOST) {
  process.env.AUTH_TRUST_HOST = "true";
}

const isProd = process.env.NODE_ENV === "production";
export const AUTH_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

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
    signIn: "/auth",
    error: "/auth",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.permissions = user.permissions;
        token.sessionPolicyVersion = getTenantSessionPolicyVersion();
        token.sessionStale = false;
        token.authenticatedAt = Math.floor(Date.now() / 1000);
      } else {
        const authenticatedAt = Number(token.authenticatedAt ?? token.iat ?? 0);
        const sessionTooOld = !authenticatedAt || Math.floor(Date.now() / 1000) - authenticatedAt >= AUTH_SESSION_MAX_AGE_SECONDS;
        token.sessionStale = tenantSessionStaleReason(token.sessionPolicyVersion) !== null || sessionTooOld;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && token.role) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId as string;
        session.user.permissions = token.permissions;
        session.user.sessionPolicyVersion = token.sessionPolicyVersion as string | undefined;
        session.user.sessionStale = token.sessionStale === true;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      try {
        const target = new URL(url, baseUrl);
        if (target.origin !== new URL(baseUrl).origin) return baseUrl;
        if (
          target.pathname.startsWith("/auth/") &&
          !["/auth/master", "/auth/forgot-password", "/auth/reset-password"].includes(target.pathname)
        ) target.pathname = "/auth";
        return target.href;
      } catch {
        return baseUrl;
      }
    },
  },
  session: {
    strategy: "jwt",
    // Cookies may be refreshed while active, but authenticatedAt in the JWT
    // enforces an absolute 8-hour credential lifetime in the callback above.
    // This prevents routine session polling from extending a login forever.
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS, // 8 h absolute credential lifetime
    updateAge: 60 * 60,    // refresh every 1 h of active use
  },
  // We remove the explicit `cookies` override. NextAuth (Auth.js v5) automatically 
  // uses the `__Secure-` prefix on HTTPS and strips it on HTTP.
  // It will also use host-only cookies (domain=undefined) by default, 
  // which works perfectly across most proxy and localhost setups.
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [], // Providers are configured in auth.ts
} satisfies NextAuthConfig;
