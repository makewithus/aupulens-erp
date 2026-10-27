import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseErpIntent } from "@/lib/ai/erpIntent";
import { customerDraftSummary, extractCustomerFields } from "@/lib/ai/customerDraft";
import { getModuleCapability, getAllModuleCapabilities, isOperationSupported, isActionConfirmationRequired } from "@/lib/ai/capabilityRegistry";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Comprehensive Bug Fix, UI Repair, AI Context & Cross-Module Intelligence", () => {
  describe("Issue 1: Customer creation multi-turn context & Sherhan flow", () => {
    it("extracts phone number and retains customer name", () => {
      const fields1 = extractCustomerFields("Create a customer called Sherhan");
      expect(fields1.name).toBe("Sherhan");
      expect(fields1.is_company).toBeUndefined();

      const summary1 = customerDraftSummary({ name: "Sherhan" });
      expect(summary1).toContain("Name: Sherhan");
      expect(summary1).toContain("Type: Not specified");
      expect(summary1).toContain("Phone: Not specified");

      const fields2 = extractCustomerFields("1234567899");
      expect(fields2.phone).toBe("1234567899");
      expect(fields2.is_company).toBeUndefined();

      const summary2 = customerDraftSummary({ name: "Sherhan", phone: "1234567899" });
      expect(summary2).toContain("Name: Sherhan");
      expect(summary2).toContain("Phone: 1234567899");
      expect(summary2).toContain("Type: Not specified");
      expect(summary2).toContain("What type of customer is Sherhan: Individual or Business?");
    });

    it("routes customer update when draft is pending", () => {
      const intent = parseErpIntent("1234567899", new Date(), {
        pendingCustomerProposalId: "prop-sherhan-123",
      });
      expect(intent).toBe("customer_update");
    });

    it("confirms customer draft explicitly", () => {
      const intent = parseErpIntent("confirm customer", new Date(), {
        pendingCustomerProposalId: "prop-sherhan-123",
      });
      expect(intent).toBe("customer_confirm");
    });
  });

  describe("Issue 2: Module navigation redirects & consistency", () => {
    it("verifies projects redirect route exists", () => {
      const projectsPageContent = readFileSync(
        resolve(process.cwd(), "app/projects/page.tsx"),
        "utf-8"
      );
      expect(projectsPageContent).toContain('redirect("/projects/dashboard")');
    });

    it("verifies inventory redirect route exists", () => {
      const invPageContent = readFileSync(
        resolve(process.cwd(), "app/inventory/page.tsx"),
        "utf-8"
      );
      expect(invPageContent).toContain('redirect("/inventory/dashboard")');
    });

    it("verifies DashboardHeader module hrefs point to respective dashboards", () => {
      const headerContent = readFileSync(
        resolve(process.cwd(), "components/dashboard/DashboardHeader.tsx"),
        "utf-8"
      );
      expect(headerContent).toContain('href: "/sales/dashboard"');
      expect(headerContent).toContain('href: "/inventory/dashboard"');
      expect(headerContent).toContain('href: "/finance/summary"');
      expect(headerContent).toContain('href: "/projects/dashboard"');
      expect(headerContent).toContain('landingHref: "/projects/dashboard"');
      expect(headerContent).toContain('landingHref: "/inventory/dashboard"');
      expect(headerContent).toContain('landingHref: "/hr/dashboard"');
    });
  });

  describe("Issue 3: Hover and active-state styling theme tokens", () => {
    it("verifies globals.css defines --tertiary in :root, .dark, and @theme inline", () => {
      const cssContent = readFileSync(
        resolve(process.cwd(), "app/globals.css"),
        "utf-8"
      );
      expect(cssContent).toContain("--color-tertiary: var(--tertiary)");
      expect(cssContent).toContain("--tertiary: oklch(0.96 0 0)");
      expect(cssContent).toContain("--tertiary: #1f1f1f");
    });
  });

  describe("Issue 5: HR employee count queries vs invoice count routing", () => {
    it("routes 'How many employees are there in total?' to employee_count total", () => {
      const intent = parseErpIntent("How many employees are there in total?");
      expect(intent).toEqual({ type: "employee_count", scope: "total" });
    });

    it("routes 'How many employees are active?' to employee_count active", () => {
      const intent = parseErpIntent("How many employees are active?");
      expect(intent).toEqual({ type: "employee_count", scope: "active" });
    });

    it("routes 'How many employee accounts are linked to users?' to employee_count linked", () => {
      const intent = parseErpIntent("How many employee accounts are linked to users?");
      expect(intent).toEqual({ type: "employee_count", scope: "linked" });
    });

    it("routes 'How many employees have no user account?' to employee_count unlinked", () => {
      const intent = parseErpIntent("How many employees have no user account?");
      expect(intent).toEqual({ type: "employee_count", scope: "unlinked" });
    });

    it("routes 'How many employees are in Finance?' to employee_count department", () => {
      const intent = parseErpIntent("How many employees are in Finance?");
      expect(intent).toEqual({
        type: "employee_count",
        scope: "department",
        department: "Finance",
      });
    });

    it("preserves employee department context on follow-up 'What about active ones?'", () => {
      const intent = parseErpIntent("What about active ones?", new Date(), {
        lastErpQuery: {
          entity: "employee",
          type: "employee_count",
          scope: "department",
          department: "Finance",
        },
      });
      expect(intent).toEqual({
        type: "employee_count",
        scope: "active",
        department: "Finance",
      });
    });

    it("routes 'How many invoices are there in total?' to invoice count without cross-contamination", () => {
      const intent = parseErpIntent("How many invoices are there in total?", new Date(), {
        lastErpQuery: {
          entity: "employee",
          type: "employee_count",
          scope: "total",
        },
      });
      expect(intent).toEqual({
        entity: "invoice",
        operation: "count",
      });
    });
  });

  describe("Issue 8: HR analytics export CSV escaping & structure", () => {
    it("verifies HR analytics page implements formula escaping and structured dimensions", () => {
      const hrAnalyticsContent = readFileSync(
        resolve(process.cwd(), "app/hr/analytics/page.tsx"),
        "utf-8"
      );
      expect(hrAnalyticsContent).toContain("escapeCsv");
      expect(hrAnalyticsContent).toContain('headers = ["Report Section", "Dimension / Category", "Metric", "Value", "Unit / Proportion", "Reporting Period"]');
      expect(hrAnalyticsContent).toContain("Executive Summary");
      expect(hrAnalyticsContent).toContain("Department Distribution");
      expect(hrAnalyticsContent).toContain("Attendance Compliance");
    });
  });

  describe("Issue 9: Manufacturing analytics reconciliation & synthetic data elimination", () => {
    it("verifies manufacturing analytics calculates real QC inspection distribution", () => {
      const mfgContent = readFileSync(
        resolve(process.cwd(), "app/api/manufacturing/analytics/route.ts"),
        "utf-8"
      );
      expect(mfgContent).not.toContain("qty * 50");
      expect(mfgContent).toContain("qcYieldDistribution");
      expect(mfgContent).toContain("QC Passed / Accepted");
      expect(mfgContent).toContain("QC Inspection Pending");
      expect(mfgContent).toContain("QC Rejected / Rework");
    });
  });

  describe("Issue 10: HR analytics date presets (30D, 90D, 1Y)", () => {
    it("verifies HR analytics API extracts range query and scopes server cache", () => {
      const hrApiContent = readFileSync(
        resolve(process.cwd(), "app/api/hr/analytics/route.ts"),
        "utf-8"
      );
      expect(hrApiContent).toContain('searchParams.get("range")');
      expect(hrApiContent).toContain("hr-analytics-live:${tenantId}:${range}");
    });
  });

  describe("Central AI Capability Registry", () => {
    it("registers all 10 enabled modules", () => {
      const capabilities = getAllModuleCapabilities();
      const ids = capabilities.map(c => c.id);
      expect(ids).toContain("sales");
      expect(ids).toContain("inventory");
      expect(ids).toContain("finance");
      expect(ids).toContain("hr");
      expect(ids).toContain("crm");
      expect(ids).toContain("manufacturing");
      expect(ids).toContain("purchases");
      expect(ids).toContain("projects");
      expect(ids).toContain("admin");
      expect(ids).toContain("subscriptions");
    });

    it("defines authoritative services, read operations and mutations for HR", () => {
      const hrCap = getModuleCapability("hr");
      expect(hrCap).toBeDefined();
      expect(hrCap?.landingRoute).toBe("/hr/dashboard");
      expect(hrCap?.readOperations).toContain("count_employees_total");
      expect(hrCap?.readOperations).toContain("count_employees_active");
      expect(hrCap?.readOperations).toContain("count_employees_by_department");
      expect(hrCap?.supportedMutations).toContain("create_employee");
      expect(hrCap?.supportedMutations).toContain("change_user_role");
      expect(hrCap?.authoritativeQueryServices).toContain("Employee.countDocuments");
    });

    it("verifies operation support and action confirmation rules", () => {
      expect(isOperationSupported("sales", "query_invoices")).toBe(true);
      expect(isOperationSupported("sales", "create_customer_draft")).toBe(true);
      expect(isOperationSupported("sales", "unsupported_fake_operation")).toBe(false);

      expect(isActionConfirmationRequired("confirm_customer_draft")).toBe(true);
      expect(isActionConfirmationRequired("change_user_role")).toBe(true);
      expect(isActionConfirmationRequired("query_invoices")).toBe(false);
    });
  });
});
