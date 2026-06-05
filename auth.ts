import NextAuth, { DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Organization from "@/models/Organization";
import { authConfig } from "./auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      tenantId: string;
    } & DefaultSession["user"];
  }
  interface User {
    role: string;
    tenantId: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    tenantId?: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
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

          const isPasswordValid = await bcrypt.compare(
            credentials.password as string,
            user.password,
          );

          if (!isPasswordValid) {
            return null;
          }

          // Role vs Portal Security Check
          if (user.role === "admin" && !portal.includes("/auth/admin")) {
            throw new Error("Invalid credentials");
          }
          if (user.role === "finance" && !portal.includes("/auth/finance")) {
            throw new Error("Invalid credentials");
          }
          if (
            user.role === "inventory" &&
            !portal.includes("/auth/inventory")
          ) {
            throw new Error("Invalid credentials");
          }
          if (user.role === "sales" && !portal.includes("/auth/sales")) {
            throw new Error("Invalid credentials");
          }
          if (
            user.role === "manufacturing" &&
            !portal.includes("/auth/manufacturing")
          ) {
            throw new Error("Invalid credentials");
          }
          if (user.role === "hr" && !portal.includes("/auth/hr")) {
            throw new Error("Invalid credentials");
          }
          if (
            user.role === "master-admin" &&
            !portal.includes("/auth/master")
          ) {
            throw new Error("Invalid credentials");
          }

          if (user.status !== "active") {
            throw new Error("Your user account has been deactivated.");
          }

          return {
            id: String(user._id),
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
          };
        } catch (error: any) {
          throw error;
        }
      },
    }),
  ],
});
