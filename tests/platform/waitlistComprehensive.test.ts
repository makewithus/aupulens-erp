import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as publicWaitlistPOST, OPTIONS as publicWaitlistOPTIONS } from "@/app/api/public/waitlist/route";
import { GET as platformWaitlistGET } from "@/app/api/platform/waitlist/route";
import { PATCH as platformWaitlistPATCH } from "@/app/api/platform/waitlist/[id]/route";
import * as sendEmailModule from "@/lib/email/sendEmail";
import * as adminSessionModule from "@/lib/platform/auth/adminSession";
import Waitlist from "@/models/platform/Waitlist";

describe("Waitlist Comprehensive Integration & Security Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("CORS Handling", () => {
    it("handles OPTIONS preflight for aupulens.com", async () => {
      const req = new NextRequest("http://localhost:3000/api/public/waitlist", {
        method: "OPTIONS",
        headers: { origin: "https://aupulens.com" },
      });
      const res = await publicWaitlistOPTIONS(req);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://aupulens.com");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });

    it("allows localhost origins for local testing", async () => {
      const req = new NextRequest("http://localhost:3000/api/public/waitlist", {
        method: "OPTIONS",
        headers: { origin: "http://localhost:8080" },
      });
      const res = await publicWaitlistOPTIONS(req);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8080");
    });
  });

  describe("Public Waitlist Validation & Honeypot", () => {
    it("rejects invalid email addresses with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "Acme",
          email: "not-an-email",
        }),
      });

      const res = await publicWaitlistPOST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("valid email");
    });

    it("rejects missing company name with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
        }),
      });

      const res = await publicWaitlistPOST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("Company name is required");
    });

    it("silently swallows honeypot submissions without saving to DB", async () => {
      const req = new NextRequest("http://localhost:3000/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "Bot Spammer Inc",
          email: "bot@spam.com",
          _hp: "http://malicious-spam-link.com", // Honeypot filled by bot
        }),
      });

      const res = await publicWaitlistPOST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe("Request received.");
    });
  });

  describe("Global Admin Authentication & Authorization", () => {
    it("rejects unauthenticated requests to GET /api/platform/waitlist with 401", async () => {
      vi.spyOn(adminSessionModule, "getAdminActorFromRequest").mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/platform/waitlist");
      const res = await platformWaitlistGET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("Not authenticated");
    });

    it("rejects unauthenticated requests to PATCH /api/platform/waitlist/[id] with 401", async () => {
      vi.spyOn(adminSessionModule, "getAdminActorFromRequest").mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/platform/waitlist/123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Approved" }),
      });
      const res = await platformWaitlistPATCH(req, { params: Promise.resolve({ id: "123" }) });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("rejects invalid status updates with 400 when authenticated", async () => {
      vi.spyOn(adminSessionModule, "getAdminActorFromRequest").mockResolvedValue({
        id: "admin_123",
        email: "admin@aupulens.com",
        name: "Global Admin",
        role: "GLOBAL_SUPER_ADMIN" as any,
        sessionId: "sess_123",
      });

      const req = new NextRequest("http://localhost:3000/api/platform/waitlist/123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "InvalidCustomStatus" }),
      });
      const res = await platformWaitlistPATCH(req, { params: Promise.resolve({ id: "123" }) });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("Invalid status");
    });
  });
});
