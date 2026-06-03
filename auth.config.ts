import type { NextAuthConfig } from "next-auth";

if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET || "5e4f8b3a7c1d9e2f6a8b0c4d7e9f1a3b5c7d8e0f2a4b6c8d1e3f5a7b9c0d2e4";
}

if (!process.env.AUTH_TRUST_HOST) {
  process.env.AUTH_TRUST_HOST = "true";
}

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
  // Native cookie handling (Host-only isolation by default in production)
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [], // Providers are configured in auth.ts
} satisfies NextAuthConfig;
