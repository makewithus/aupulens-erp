import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import connectDB from "@/lib/db";
import User from "@/models/auth/User";
import Organization from "@/models/admin/Organization";
import { authConfig } from "@/auth.config";
import { getEmailService, renderTemplate } from "@/lib/email/sendEmail";

describe("Auth.js & Nodemailer Compatibility Verification", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $in: ["auth-test@example.com", "deactivated@example.com", "suspended@example.com"] } });
    await Organization.deleteMany({ subdomain: { $in: ["auth-test-org", "suspended-org"] } });
  });

  describe("Auth.js Credential & Policy Flow", () => {
    it("successfully creates a valid user and hashes password with bcrypt", async () => {
      const password = "ValidPassword123!";
      const hashedPassword = await bcrypt.hash(password, 10);

      const ownerId = new mongoose.Types.ObjectId();
      const org = await Organization.create({
        name: "Auth Test Org",
        subdomain: "auth-test-org",
        isActive: true,
        tier: "starter",
        status: "active",
        ownerUserId: ownerId,
      });

      const user = await User.create({
        name: "Test User",
        email: "auth-test@example.com",
        phone: "+919876543210",
        password: hashedPassword,
        role: "admin",
        tenantId: "auth-test-org",
        status: "active",
        permissions: ["finance.read", "sales.read"],
      });

      expect(user._id).toBeDefined();
      expect(await bcrypt.compare(password, user.password)).toBe(true);
      expect(await bcrypt.compare("wrong-password", user.password)).toBe(false);
    });

    it("jwt callback creates token with authenticatedAt and sessionPolicyVersion", async () => {
      const token = await authConfig.callbacks.jwt({
        token: {},
        user: {
          id: "u123",
          name: "Test User",
          email: "auth-test@example.com",
          role: "admin",
          tenantId: "auth-test-org",
          permissions: ["sales.write"],
          orgModuleData: { tier: "growth", activeModules: ["sales"] },
          entitlementVersion: 1,
          entitlementCheckedAt: Date.now(),
        } as any,
      });

      expect(token.id).toBe("u123");
      expect(token.role).toBe("admin");
      expect(token.tenantId).toBe("auth-test-org");
      expect(token.permissions).toEqual(["sales.write"]);
      expect(token.authenticatedAt).toBeGreaterThan(0);
      expect(token.sessionStale).toBe(false);
    });

    it("jwt callback detects stale sessions when session is older than 8 hours", async () => {
      const nineHoursAgo = Math.floor(Date.now() / 1000) - 9 * 3600;
      const token = await authConfig.callbacks.jwt({
        token: {
          id: "u123",
          role: "admin",
          tenantId: "auth-test-org",
          authenticatedAt: nineHoursAgo,
        },
        user: undefined as any,
      });

      expect(token.sessionStale).toBe(true);
    });

    it("session callback propagates user claims and sessionStale status", async () => {
      const session = await (authConfig.callbacks.session as any)({
        session: { user: {}, expires: new Date().toISOString() },
        token: {
          id: "u123",
          role: "admin",
          tenantId: "auth-test-org",
          permissions: ["finance.all"],
          sessionStale: false,
        },
      });

      expect(session.user.id).toBe("u123");
      expect(session.user.role).toBe("admin");
      expect(session.user.tenantId).toBe("auth-test-org");
      expect(session.user.permissions).toEqual(["finance.all"]);
      expect(session.user.sessionStale).toBe(false);
    });
  });

  describe("Nodemailer Email Service Compatibility", () => {
    it("renders email templates accurately with substitution variables", () => {
      const template = "Welcome {{name}}! Your verification code for {{orgName}} is {{code}}.";
      const rendered = renderTemplate(template, {
        name: "Jane",
        orgName: "Acme Corp",
        code: 987654,
      });

      expect(rendered).toBe("Welcome Jane! Your verification code for Acme Corp is 987654.");
    });

    it("handles missing variables in template gracefully without 'undefined'", () => {
      const template = "Hello {{name}}, code: {{code}}";
      const rendered = renderTemplate(template, { name: "John" });
      expect(rendered).toBe("Hello John, code: ");
    });

    it("successfully sends an email through nodemailer using stream/JSON transport", async () => {
      // Verify nodemailer library can create transport and send email without runtime errors
      const testTransport = nodemailer.createTransport({
        jsonTransport: true,
      });

      const sendResult = await testTransport.sendMail({
        from: '"Aupulens ERP" <system@aupulens.com>',
        to: "recipient@example.com",
        subject: "Verification Code: 123456",
        text: "Your one-time code is 123456. It expires in 10 minutes.",
        html: "<p>Your one-time code is <strong>123456</strong>.</p>",
      });

      expect(sendResult.messageId).toBeDefined();
      const messageObj = JSON.parse(sendResult.message);
      expect(messageObj.to[0].address).toBe("recipient@example.com");
      expect(messageObj.subject).toBe("Verification Code: 123456");
      expect(messageObj.text).toContain("123456");
    });

    it("gracefully catches and returns formatted error on unconfigured SMTP without crashing", async () => {
      const originalUser = process.env.SMTP_USER;
      const originalPass = process.env.SMTP_PASS;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      try {
        const emailService = getEmailService();
        const result = await emailService.send({
          to: "nobody@example.com",
          subject: "Test",
          body: "Hello",
        });

        expect(result.success).toBe(false);
        expect(result.provider).toBe("smtp");
        expect(result.message).toBeDefined();
      } finally {
        if (originalUser) process.env.SMTP_USER = originalUser;
        if (originalPass) process.env.SMTP_PASS = originalPass;
      }
    });
  });
});
