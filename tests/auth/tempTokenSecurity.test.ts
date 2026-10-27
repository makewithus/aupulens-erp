vi.mock("@/lib/auth/registrationTransaction", () => ({ registrationTransaction: (work: any) => work(undefined) }));
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

const { findOneUserMock, createUserMock } = vi.hoisted(() => ({
  findOneUserMock: vi.fn(),
  createUserMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/admin/Organization", () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ _id: "org1", save: vi.fn() }),
  },
}));
vi.mock("@/models/auth/User", () => ({
  default: {
    findOne: findOneUserMock,
    countDocuments: vi.fn().mockResolvedValue(0),
    create: createUserMock,
  },
}));
vi.mock("@/lib/billing/appendSubscriptionEvent", () => ({ appendSubscriptionEvent: vi.fn() }));
vi.mock("@/lib/accounting/coa-seeder", () => ({ seedChartOfAccounts: vi.fn() }));
vi.mock("@/lib/accounting/coa-feature-seeder", () => ({ seedNewChartOfAccounts: vi.fn() }));

import { POST } from "@/app/api/auth/register/route";
import { NextRequest } from "next/server";

describe("AUP-010: Temporary Token Security & Password Segregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ALLOW_PUBLIC_REGISTRATION", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("stores only a SHA-256 hash in the database, never plaintext", async () => {
    createUserMock.mockImplementation((userData: any) => ({
      _id: "user-123",
      ...userData,
    }));

    const req = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Security Tester",
        email: "sec@example.com",
        phone: "+91 9999999999",
        password: "securePassword123",
        subdomain: "sec-org",
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.tempToken).toBeDefined();
    expect(json.tempToken).toMatch(/^autologin_[a-f0-9]{48}$/);

    const savedUserArg = createUserMock.mock.calls[0][0];
    expect(savedUserArg.tempToken).toBeUndefined(); // Plaintext token NOT stored
    expect(savedUserArg.tempTokenHash).toBeDefined(); // Only hash stored

    // Verify the stored hash matches SHA-256 of the returned raw token
    const expectedHash = crypto.createHash("sha256").update(json.tempToken).digest("hex");
    expect(savedUserArg.tempTokenHash).toBe(expectedHash);
  });
});
