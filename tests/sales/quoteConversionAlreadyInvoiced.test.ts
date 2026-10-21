import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authMock, findQuoteMock, convertMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findQuoteMock: vi.fn(),
  convertMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/sales/SalesQuotation", () => ({ default: { findOne: findQuoteMock } }));
vi.mock("@/lib/sales/quoteInvoice", () => ({
  convertQuoteToInvoice: convertMock,
  QuoteInvoiceError: class QuoteInvoiceError extends Error {
    status = 409;
  },
}));
vi.mock("@/lib/sales/q2cSync", () => ({ syncSaleOrderOnQuoteConverted: vi.fn() }));

import { POST } from "@/app/api/sales/quotes/[id]/convert-to-invoice/route";

describe("quote conversion route conflict response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1", tenantId: "tenant-1" } });
  });

  it("returns 409 and does not convert a quote that already has an invoice", async () => {
    findQuoteMock.mockResolvedValue({
      _id: "quote-1",
      status: "invoiced",
      convertedInvoiceId: "invoice-1",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/sales/quotes/quote-1/convert-to-invoice", { method: "POST" }),
      { params: Promise.resolve({ id: "quote-1" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      message: "This quote has already been invoiced.",
    });
    expect(convertMock).not.toHaveBeenCalled();
  });
});
