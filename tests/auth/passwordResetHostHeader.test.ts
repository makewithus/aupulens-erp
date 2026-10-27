import { describe, it, expect, beforeEach, vi } from "vitest";

const { findOneUserMock, sendMailMock } = vi.hoisted(() => ({
  findOneUserMock: vi.fn(),
  sendMailMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/auth/User", () => ({
  default: {
    findOne: findOneUserMock,
  },
}));
vi.mock("@/lib/email/sendEmail", () => ({
  getEmailService: () => ({ send: sendMailMock }),
}));

import { POST } from "@/app/api/auth/password-reset/request/route";
import { NextRequest } from "next/server";

describe("AUP-015: Password Reset Host Header Poisoning Defense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_BASE_URL = "https://app.aupulens.online";
  });

  it("ignores malicious Host header and constructs reset link from canonical config", async () => {
    const mockUser = {
      _id: "user-target",
      name: "Target User",
      email: "target@example.com",
      tenantId: "default-tenant",
      save: vi.fn().mockResolvedValue(true),
    };
    findOneUserMock.mockResolvedValue(mockUser);

    // Attacker sends request with spoofed Host header
    const req = new NextRequest("http://localhost:3000/api/auth/password-reset/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "host": "evil.attacker.com",
        "x-forwarded-host": "evil.attacker.com",
      },
      body: JSON.stringify({
        email: "target@example.com",
        tenantId: "default-tenant",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify email content sent
    expect(sendMailMock).toHaveBeenCalled();
    const sentMail = sendMailMock.mock.calls[0][0];

    // Assert that evil.attacker.com was NOT used in the reset link
    expect(sentMail.body).not.toContain("evil.attacker.com");
    expect(sentMail.html).not.toContain("evil.attacker.com");

    // Assert that canonical origin was used
    expect(sentMail.body).toContain("https://app.aupulens.online/auth/reset-password?token=");
    expect(sentMail.html).toContain("https://app.aupulens.online/auth/reset-password?token=");
  });
});
