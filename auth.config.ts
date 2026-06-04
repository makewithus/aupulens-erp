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
  // Override the session-token cookie to be a SESSION cookie (no maxAge).
  // A session cookie lives only until the browser is closed — no persistence.
  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: isProd,
        // maxAge intentionally OMITTED → browser treats this as a session cookie
        // and deletes it when the browser closes.
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [], // Providers are configured in auth.ts
} satisfies NextAuthConfig;
