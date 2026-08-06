import NextAuth, { DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Organization from "@/models/Organization";
import { authConfig } from "./auth.config";
import { resolveOAuthSignIn } from "@/lib/auth/oauthSignIn";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      tenantId: string;
      permissions?: string[];
    } & DefaultSession["user"];
  }
  interface User {
    role: string;
    tenantId: string;
    permissions?: string[];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    tenantId?: string;
    permissions?: string[];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // OAuth-only (Credentials is handled by CredentialsProvider.authorize()
    // below — resolveOAuthSignIn() passes credentials through immediately).
    // Tenant is resolved from the request hostname, same parser middleware
    // uses (lib/tenant/resolution.ts), so there's no divergence between how
    // the two determine which workspace a login belongs to.
    async signIn({ user, account }) {
      return resolveOAuthSignIn(user, account, async () => {
        const h = await headers();
        return h.get("host") || "";
      });
    },
  },
  providers: [
    // Google/Microsoft are only registered when their credentials are
    // configured — an unconfigured provider would otherwise show a broken
    // "Sign in with Google" button that fails on click.
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      ? [
          MicrosoftEntraID({
            clientId: process.env.MICROSOFT_CLIENT_ID,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
            issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || "common"}/v2.0`,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        tenantId: { label: "Tenant ID", type: "text" },
        portal: { label: "Portal", type: "text" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          await connectDB();

          const requestedTenantId =
            (credentials.tenantId as string) || "default-tenant";
          let expectedTenantId =
            requestedTenantId === "default"
              ? "default-tenant"
              : requestedTenantId;
          const email = (credentials.email as string).toLowerCase();
          const portal = (credentials.portal as string) || "";

          let user = null;
          if (portal.includes("/auth/master")) {
            user = await User.findOne({ email, role: "master-admin" });
          } else {
            user = await User.findOne({ email, tenantId: expectedTenantId });
            if (!user && expectedTenantId === "default-tenant") {
              user = await User.findOne({ email });
              if (user) {
                expectedTenantId = user.tenantId;
              }
            }
          }

          if (!user) {
            return null;
          }

          // Security Check 1: Tenant Mismatch
          if (
            user.role !== "master-admin" &&
            user.tenantId !== expectedTenantId
          ) {
            throw new Error(
              "You do not have access to this organization workspace.",
            );
          }

          // Security Check 2: Organization Active Status
          if (user.tenantId !== "default") {
            const org = await Organization.findOne({
              subdomain: user.tenantId,
            });
            if (org && !org.isActive) {
              throw new Error(
                "This organization's workspace is suspended. Please contact support.",
              );
            }
          }

          let isPasswordValid = false;
          const inputPassword = credentials.password as string;

          if (
            user.tempToken &&
            user.tempTokenExpiry &&
            new Date(user.tempTokenExpiry) > new Date() &&
            inputPassword === user.tempToken
          ) {
            isPasswordValid = true;
            // Consume the temporary token
            user.tempToken = undefined;
            user.tempTokenExpiry = undefined;
            await user.save();
          } else {
            isPasswordValid = await bcrypt.compare(
              inputPassword,
              user.password,
            );
          }

          if (!isPasswordValid) {
            return null;
          }

          // Role vs Portal Security Check
          // Removed to allow unified login from onboarding and automatic routing via middleware.
          /* 
          if (
            user.role === "master-admin" &&
            !portal.includes("/auth/master")
          ) {
            throw new Error("Invalid credentials");
          }
          */

          if (user.status !== "active") {
            throw new Error("Your user account has been deactivated.");
          }

          return {
            id: String(user._id),
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            permissions: user.permissions,
          };
        } catch (error: any) {
          throw error;
        }
      },
    }),
  ],
});
