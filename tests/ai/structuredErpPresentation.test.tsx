import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { StructuredErpView, formatStatusLabel, getStatusBadgeClass } from "@/components/ai/StructuredErpView";
import { AiMarkdown } from "@/components/ai/AiMarkdown";
import { parseStructuredErpText } from "@/lib/ai/erpPresentation";
import type { ErpStructuredResponse } from "@/lib/ai/erpTypes";

describe("Structured ERP Presentation & AI Response UI", () => {
  describe("1. Simple customer count response", () => {
    it("renders concise answer with emphasized count and authoritative label", () => {
      const data: ErpStructuredResponse = {
        type: "count",
        entity: "customer",
        count: 280,
        label: "Total customers",
      };
      const html = renderToStaticMarkup(React.createElement(StructuredErpView, { data }));

      expect(html).toContain("Total customers");
      expect(html).toContain("280");
      expect(html).toContain("records");
      expect(html).toContain("Authoritative count from ERP database");
    });

    it("renders fallback parsed count string into structured count card", () => {
      const parsed = parseStructuredErpText("280 customer records.");
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe("count");
      if (parsed?.type === "count") {
        expect(parsed.count).toBe(280);
        expect(parsed.entity).toBe("customer");
      }

      const html = renderToStaticMarkup(
        React.createElement(AiMarkdown, { content: "280 customer records." })
      );
      expect(html).toContain("280");
      expect(html).toContain("Total customers");
    });
  });

  describe("2 & 3. Unpaid invoices list & Highlighted financial total", () => {
    const unpaidInvoicesData: ErpStructuredResponse = {
      type: "record_list",
      entity: "invoice",
      title: "Unpaid invoices for Rajesh Kumar",
      records: [
        {
          id: "inv-1",
          number: "INV-0076",
          customerName: "Rajesh Kumar",
          amount: 29146,
          formattedAmount: "₹29,146",
          status: "saved",
          date: "22/09/2026",
          route: "/sales/invoices",
        },
        {
          id: "inv-2",
          number: "INV-0075",
          customerName: "Rajesh Kumar",
          amount: 29146,
          formattedAmount: "₹29,146",
          status: "saved",
          date: "22/09/2026",
          route: "/sales/invoices",
        },
        {
          id: "inv-3",
          number: "INV-0050",
          customerName: "Rajesh Kumar",
          amount: 900,
          formattedAmount: "₹900",
          status: "saved",
          date: "02/08/2026",
          route: "/sales/invoices",
        },
      ],
      total: {
        label: "Total outstanding",
        amount: 59192,
        formattedAmount: "₹59,192",
        count: 3,
      },
    };

    it("renders each invoice as an individual row/card with customer, amount, status, and date", () => {
      const html = renderToStaticMarkup(React.createElement(StructuredErpView, { data: unpaidInvoicesData }));

      // Document numbers with valid routes
      expect(html).toContain("INV-0076");
      expect(html).toContain("INV-0075");
      expect(html).toContain("INV-0050");
      expect(html).toContain('href="/sales/invoices"');

      // Customer name
      expect(html).toContain("Rajesh Kumar");

      // Amounts
      expect(html).toContain("₹29,146");
      expect(html).toContain("₹900");

      // Status badges
      expect(html).toContain("Saved");

      // Formatted dates (DD/MM/YYYY)
      expect(html).toContain("22/09/2026");
      expect(html).toContain("02/08/2026");
    });

    it("renders dedicated highlighted financial total below records", () => {
      const html = renderToStaticMarkup(React.createElement(StructuredErpView, { data: unpaidInvoicesData }));

      expect(html).toContain("Total outstanding");
      expect(html).toContain("₹59,192");
      expect(html).toContain("3 invoices");
    });

    it("safely parses legacy run-together text into structured records and total", () => {
      const legacyText =
        "INV-0076 — Rajesh Kumar — ₹29,146 — saved — 22/9/2026\n" +
        "INV-0075 — Rajesh Kumar — ₹29,146 — saved — 22/9/2026\n" +
        "INV-0050 — Rajesh Kumar — ₹900 — saved — 2/8/2026\n" +
        "Total outstanding across all 3 matches: ₹59,192.";

      const parsed = parseStructuredErpText(legacyText);
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe("record_list");

      if (parsed?.type === "record_list") {
        expect(parsed.records).toHaveLength(3);
        expect(parsed.records[0].number).toBe("INV-0076");
        expect(parsed.records[0].formattedAmount).toBe("₹29,146");
        expect(parsed.records[0].date).toBe("22/09/2026");
        expect(parsed.records[2].number).toBe("INV-0050");
        expect(parsed.records[2].date).toBe("02/08/2026");

        expect(parsed.total).toBeDefined();
        expect(parsed.total?.label).toBe("Total outstanding");
        expect(parsed.total?.formattedAmount).toBe("₹59,192");
        expect(parsed.total?.count).toBe(3);
      }

      // Renders through AiMarkdown
      const html = renderToStaticMarkup(React.createElement(AiMarkdown, { content: legacyText }));
      expect(html).toContain("INV-0076");
      expect(html).toContain("INV-0075");
      expect(html).toContain("INV-0050");
      expect(html).toContain("Total outstanding");
      expect(html).toContain("₹59,192");
    });
  });

  describe("4. Missing invoice response", () => {
    it("renders concise, helpful missing record alert without stack traces", () => {
      const data: ErpStructuredResponse = {
        type: "not_found",
        identifier: "INV-9999",
        message: "INV-9999 was not found in your accessible records.",
      };
      const html = renderToStaticMarkup(React.createElement(StructuredErpView, { data }));

      expect(html).toContain("Record Not Found");
      expect(html).toContain("INV-9999 was not found in your accessible records.");
      expect(html).toContain("Verify the document identifier or customer name");
      expect(html).not.toContain("Error:");
      expect(html).not.toContain("stack");
    });

    it("parses not_found message from plain text fallback", () => {
      const parsed = parseStructuredErpText("INV-9999 was not found in your accessible records.");
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe("not_found");
      if (parsed?.type === "not_found") {
        expect(parsed.identifier).toBe("INV-9999");
      }
    });
  });

  describe("5. Quote proposal with confirm and cancel actions", () => {
    const proposalData: ErpStructuredResponse = {
      type: "quote_proposal",
      proposalId: "prop-12345",
      customer: "Himalaya Fitness Studio",
      item: "Ergonomic Office Chair",
      quantity: 2,
      unit: "pcs",
      unitPrice: 5000,
      formattedUnitPrice: "₹5,000",
      subtotal: 10000,
      formattedSubtotal: "₹10,000",
      discount: 500,
      formattedDiscount: "₹500",
      tax: 1710,
      formattedTax: "₹1,710",
      total: 11210,
      formattedTotal: "₹11,210",
      status: "proposed",
    };

    it("renders structured proposal panel with draft badge and action buttons", () => {
      const html = renderToStaticMarkup(React.createElement(StructuredErpView, { data: proposalData }));

      expect(html).toContain("Quote Proposal");
      expect(html).toContain("Draft — Not saved");
      expect(html).toContain("Himalaya Fitness Studio");
      expect(html).toContain("Ergonomic Office Chair");
      expect(html).toContain("2 pcs");
      expect(html).toContain("₹5,000");
      expect(html).toContain("₹10,000");
      expect(html).toContain("-₹500");
      expect(html).toContain("+₹1,710");
      expect(html).toContain("₹11,210");
      expect(html).toContain("Confirm Quote");
      expect(html).toContain("Cancel");
      expect(html).toContain("No quote is saved until confirmed");
    });
  });

  describe("6. Successfully saved quote", () => {
    it("renders confirmed quote card with quote number link and total", () => {
      const savedData: ErpStructuredResponse = {
        type: "quote_saved",
        quoteNumber: "QUO-0042",
        status: "saved",
        total: 11210,
        formattedTotal: "₹11,210",
        route: "/sales/quotes",
      };
      const html = renderToStaticMarkup(React.createElement(StructuredErpView, { data: savedData }));

      expect(html).toContain("Quote Successfully Saved");
      expect(html).toContain("QUO-0042");
      expect(html).toContain('href="/sales/quotes"');
      expect(html).toContain("Saved");
      expect(html).toContain("₹11,210");
    });
  });

  describe("7. Invalid discount and quantity errors", () => {
    it("renders validation messages cleanly through AiMarkdown", () => {
      const errorMsg = "Quantity -2 is invalid; quantity must be greater than zero. A 150% discount is not allowed; the range is 0–100%. No draft values were changed.";
      const html = renderToStaticMarkup(React.createElement(AiMarkdown, { content: errorMsg }));

      expect(html).toContain("Quantity -2 is invalid");
      expect(html).toContain("A 150% discount is not allowed");
      expect(html).not.toContain("status: 500");
    });
  });

  describe("8. Empty query results", () => {
    it("renders empty state cleanly without crashing", () => {
      const emptyData: ErpStructuredResponse = {
        type: "record_list",
        entity: "invoice",
        records: [],
      };
      const html = renderToStaticMarkup(React.createElement(StructuredErpView, { data: emptyData }));

      expect(html).toBeDefined();
    });
  });

  describe("9. Long record identifiers and large currency amounts", () => {
    it("formats Indian currency digit grouping properly for large amounts", () => {
      const data: ErpStructuredResponse = {
        type: "financial_total",
        label: "Total revenue",
        amount: 12500000,
        formattedAmount: "₹1,25,00,000",
        count: 1420,
      };
      const html = renderToStaticMarkup(React.createElement(StructuredErpView, { data }));

      expect(html).toContain("Total revenue");
      expect(html).toContain("₹1,25,00,000");
      expect(html).toContain("Across 1420 records");
    });
  });

  describe("10. Dark and light theme accessibility", () => {
    it("uses standard design tokens (bg-card, border-border, text-foreground)", () => {
      const data: ErpStructuredResponse = {
        type: "count",
        entity: "customer",
        count: 42,
      };
      const html = renderToStaticMarkup(React.createElement(StructuredErpView, { data }));

      expect(html).toContain("bg-card");
      expect(html).toContain("border-border");
      expect(html).toContain("text-foreground");
    });
  });

  describe("11. Status badge helper functions", () => {
    it("returns correct semantic styling for paid, overdue, and saved statuses", () => {
      expect(formatStatusLabel("paid")).toBe("Paid");
      expect(formatStatusLabel("partially_paid")).toBe("Partially paid");
      expect(formatStatusLabel("overdue")).toBe("Overdue");

      expect(getStatusBadgeClass("paid")).toContain("emerald");
      expect(getStatusBadgeClass("overdue")).toContain("rose");
      expect(getStatusBadgeClass("pending")).toContain("amber");
      expect(getStatusBadgeClass("saved")).toContain("slate");
    });
  });

  describe("12. Standard Markdown fallback", () => {
    it("renders normal markdown when content is non-ERP prose", () => {
      const md = "### Revenue Summary\n\nHere is an analysis:\n\n- Sales grew by **12%**\n- Top region: *North*";
      const html = renderToStaticMarkup(React.createElement(AiMarkdown, { content: md }));

      expect(html).toContain("Revenue Summary</h3>");
      expect(html).toContain('<strong class="font-semibold text-foreground">12%</strong>');
      expect(html).toContain('<em class="italic">North</em>');
      expect(html).toContain("<ul");
      expect(html).toContain("<li");
    });
  });
});
