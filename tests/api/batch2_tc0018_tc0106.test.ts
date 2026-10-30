import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted Mocks ────────────────────────────────────────────────────────────
const {
  authMock,
  dbConnectMock,
  orgFindOneMock,
  orgFindMock,
  userFindMock,
  subscriptionEventFindMock,
  getCalendarEventsMock,
  detectConflictsMock,
  accountFindMock,
  accountCountDocumentsMock,
  activityFindMock,
  oppFindMock,
  oppCountDocumentsMock,
  oppAggregateMock,
  leadFindMock,
  leadCountDocumentsMock,
  campaignFindMock,
  campaignCountDocumentsMock,
  approvalPolicyFindMock,
  approvalRequestFindMock,
  auditLogFindMock,
  auditLogCountDocumentsMock,
  automationRuleFindMock,
  caseFindMock,
  caseCountDocumentsMock,
  caseAggregateMock,
  chatHistoryFindMock,
  commFindMock,
  contactFindMock,
  contactCountDocumentsMock,
  contractFindMock,
  convSummaryFindMock,
  docFindMock,
  fieldVisitFindMock,
  handoffFindMock,
  integrationLinkFindMock,
  notifFindMock,
  onboardingPlanFindMock,
  quoteFindMock,
  templateFindMock,
  viewFindMock,
  extractedDocFindMock,
  computePipelineTrendMock,
  computeRevenueTrendMock,
  computeROITrendMock,
  calculateCampaignROIMock,
  calculateGlobalROIMock,
  getRenewalRiskSummaryMock,
  getAttributionBreakdownByChannelMock,
  computeExpansionForecastMock,
  getExpansionSummaryMock,
  scanTenantChurnRiskMock,
  computeAndStoreChurnRiskMock,
  computeAndStoreAccountHealthMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  dbConnectMock: vi.fn(),
  orgFindOneMock: vi.fn(),
  orgFindMock: vi.fn(),
  userFindMock: vi.fn(),
  subscriptionEventFindMock: vi.fn(),
  getCalendarEventsMock: vi.fn(),
  detectConflictsMock: vi.fn(),
  accountFindMock: vi.fn(),
  accountCountDocumentsMock: vi.fn(),
  activityFindMock: vi.fn(),
  oppFindMock: vi.fn(),
  oppCountDocumentsMock: vi.fn(),
  oppAggregateMock: vi.fn(),
  leadFindMock: vi.fn(),
  leadCountDocumentsMock: vi.fn(),
  campaignFindMock: vi.fn(),
  campaignCountDocumentsMock: vi.fn(),
  approvalPolicyFindMock: vi.fn(),
  approvalRequestFindMock: vi.fn(),
  auditLogFindMock: vi.fn(),
  auditLogCountDocumentsMock: vi.fn(),
  automationRuleFindMock: vi.fn(),
  caseFindMock: vi.fn(),
  caseCountDocumentsMock: vi.fn(),
  caseAggregateMock: vi.fn(),
  chatHistoryFindMock: vi.fn(),
  commFindMock: vi.fn(),
  contactFindMock: vi.fn(),
  contactCountDocumentsMock: vi.fn(),
  contractFindMock: vi.fn(),
  convSummaryFindMock: vi.fn(),
  docFindMock: vi.fn(),
  fieldVisitFindMock: vi.fn(),
  handoffFindMock: vi.fn(),
  integrationLinkFindMock: vi.fn(),
  notifFindMock: vi.fn(),
  onboardingPlanFindMock: vi.fn(),
  quoteFindMock: vi.fn(),
  templateFindMock: vi.fn(),
  viewFindMock: vi.fn(),
  extractedDocFindMock: vi.fn(),
  computePipelineTrendMock: vi.fn(),
  computeRevenueTrendMock: vi.fn(),
  computeROITrendMock: vi.fn(),
  calculateCampaignROIMock: vi.fn(),
  calculateGlobalROIMock: vi.fn(),
  getRenewalRiskSummaryMock: vi.fn(),
  getAttributionBreakdownByChannelMock: vi.fn(),
  computeExpansionForecastMock: vi.fn(),
  getExpansionSummaryMock: vi.fn(),
  scanTenantChurnRiskMock: vi.fn(),
  computeAndStoreChurnRiskMock: vi.fn(),
  computeAndStoreAccountHealthMock: vi.fn(),
}));

// Mock NextAuth session and DB
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ default: dbConnectMock }));

// Mock Server Cache
vi.mock("@/lib/api/serverCache", () => ({
  getCachedData: vi.fn().mockReturnValue(null),
  setCachedData: vi.fn(),
  invalidateCache: vi.fn(),
}));

// Mock Models
vi.mock("@/models/admin/Organization", () => ({
  default: { findOne: orgFindOneMock, find: orgFindMock },
}));

vi.mock("@/models/auth/User", () => ({
  default: { find: userFindMock },
}));

vi.mock("@/models/admin/SubscriptionEvent", () => ({
  default: { find: subscriptionEventFindMock },
}));

vi.mock("@/models/shared/CalendarEvent", () => ({
  default: { find: vi.fn(), create: vi.fn() },
}));

vi.mock("@/models/crm/Account", () => ({
  default: {
    find: accountFindMock,
    countDocuments: accountCountDocumentsMock,
    aggregate: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/models/crm/Activity", () => ({
  default: {
    find: activityFindMock,
    countDocuments: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
  },
}));

vi.mock("@/models/crm/Opportunity", () => ({
  default: {
    find: oppFindMock,
    countDocuments: oppCountDocumentsMock,
    aggregate: oppAggregateMock,
  },
}));

vi.mock("@/models/crm/Lead", () => ({
  default: {
    find: leadFindMock,
    countDocuments: leadCountDocumentsMock,
    aggregate: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/models/crm/Campaign", () => ({
  default: {
    find: campaignFindMock,
    countDocuments: campaignCountDocumentsMock,
  },
}));

vi.mock("@/models/crm/ApprovalPolicy", () => ({
  default: { find: approvalPolicyFindMock },
}));

vi.mock("@/models/crm/ApprovalRequest", () => ({
  default: { find: approvalRequestFindMock },
}));

vi.mock("@/models/crm/CrmAuditLog", () => ({
  default: {
    find: auditLogFindMock,
    countDocuments: auditLogCountDocumentsMock,
  },
}));

vi.mock("@/models/crm/AutomationRule", () => ({
  default: { find: automationRuleFindMock },
}));

vi.mock("@/models/crm/Case", () => ({
  default: {
    find: caseFindMock,
    countDocuments: caseCountDocumentsMock,
    aggregate: caseAggregateMock,
  },
}));

vi.mock("@/models/ai/ChatHistory", () => ({
  default: { find: chatHistoryFindMock },
}));

vi.mock("@/models/crm/Communication", () => ({
  default: { find: commFindMock },
}));

vi.mock("@/models/crm/Contact", () => ({
  default: {
    find: contactFindMock,
    countDocuments: contactCountDocumentsMock,
  },
}));

vi.mock("@/models/crm/Contract", () => ({
  default: {
    find: contractFindMock,
    countDocuments: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/models/crm/ConversationSummary", () => ({
  default: { find: convSummaryFindMock },
}));

vi.mock("@/models/crm/CrmDocument", () => ({
  default: { find: docFindMock },
}));

vi.mock("@/models/crm/FieldVisit", () => ({
  default: { find: fieldVisitFindMock },
}));

vi.mock("@/models/crm/Handoff", () => ({
  default: { find: handoffFindMock },
}));

vi.mock("@/models/crm/IntegrationLink", () => ({
  default: { find: integrationLinkFindMock },
}));

vi.mock("@/models/crm/Notification", () => ({
  default: { find: notifFindMock },
}));

vi.mock("@/models/crm/OnboardingPlan", () => ({
  default: { find: onboardingPlanFindMock },
}));

vi.mock("@/models/crm/Quote", () => ({
  default: {
    find: quoteFindMock,
    countDocuments: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/models/crm/MessageTemplate", () => ({
  default: { find: templateFindMock },
}));

vi.mock("@/models/crm/SavedView", () => ({
  default: { find: viewFindMock },
}));

vi.mock("@/models/ai/ExtractedDocument", () => ({
  default: { find: extractedDocFindMock },
}));

// Mock Engine & Helper Modules
vi.mock("@/lib/calendar/aggregateEvents", () => ({
  getCalendarEvents: getCalendarEventsMock,
  detectConflicts: detectConflictsMock,
}));

vi.mock("@/lib/calendar/conflictInsight", () => ({
  prioritizeConflicts: vi.fn().mockResolvedValue({ conflicts: [], summary: "ok", aiUsed: false }),
}));

vi.mock("@/lib/ai/usage", () => ({
  getAiPeriod: vi.fn().mockReturnValue("202610"),
  getAiUsageCount: vi.fn().mockResolvedValue(12),
}));

vi.mock("@/lib/ai/windowUsage", () => ({
  getWindowUsage: vi.fn().mockResolvedValue({ hour: { used: 1, limit: 100 }, minute: { used: 0, limit: 10 } }),
}));

vi.mock("@/lib/platform/ai/credits", () => ({
  getAiCreditBalance: vi.fn().mockResolvedValue({ balance: 500, resetsAt: "2026-11-01T00:00:00.00Z" }),
}));

vi.mock("@/lib/crm/churnRisk", () => ({
  scanTenantChurnRisk: scanTenantChurnRiskMock,
  computeAndStoreChurnRisk: computeAndStoreChurnRiskMock,
}));

vi.mock("@/lib/crm/accountHealth", () => ({
  computeAndStoreAccountHealth: computeAndStoreAccountHealthMock,
  refreshAllAccountHealth: vi.fn(),
}));

vi.mock("@/lib/crm/renewalEngine", () => ({
  getRenewalRiskSummary: getRenewalRiskSummaryMock,
  runRenewalEngine: vi.fn(),
}));

vi.mock("@/lib/crm/attributionEngine", () => ({
  getAttributionBreakdownByChannel: getAttributionBreakdownByChannelMock,
}));

vi.mock("@/lib/crm/pipelineEngine", () => ({
  computePipelineTrend: computePipelineTrendMock,
  computeRevenueTrend: computeRevenueTrendMock,
}));

vi.mock("@/lib/crm/roiEngine", () => ({
  calculateCampaignROI: calculateCampaignROIMock,
  calculateGlobalROI: calculateGlobalROIMock,
}));

vi.mock("@/lib/crm/campaignROITrend", () => ({
  computeROITrend: computeROITrendMock,
}));

vi.mock("@/lib/crm/expansionEngine", () => ({
  getExpansionSummary: getExpansionSummaryMock,
}));

vi.mock("@/lib/crm/expansionForecast", () => ({
  computeExpansionForecast: computeExpansionForecastMock,
}));

vi.mock("@/lib/crm/integrations/erpSync", () => ({
  checkErpSyncStatus: vi.fn().mockReturnValue("synced"),
}));

// Import Route Handlers Under Test
import { GET as getAiUsage } from "@/app/api/ai/usage/route";
import { GET as getMyWorkspaces } from "@/app/api/auth/my-workspaces/route";
import { GET as getBillingHistory } from "@/app/api/billing/history/route";
import { GET as getCalendarConflicts } from "@/app/api/calendar/conflicts/route";
import { GET as getCalendar } from "@/app/api/calendar/route";
import { GET as getCrmAccounts } from "@/app/api/crm/accounts/route";
import { GET as getCrmActivities } from "@/app/api/crm/activities/route";
import { GET as getCrmAnalytics } from "@/app/api/crm/analytics/route";
import { GET as getCrmApprovalPolicies } from "@/app/api/crm/approval-policies/route";
import { GET as getCrmApprovals } from "@/app/api/crm/approvals/route";
import { GET as getCrmAudit } from "@/app/api/crm/audit/route";
import { GET as getCrmAutomations } from "@/app/api/crm/automations/route";
import { GET as getCrmCasesKpi } from "@/app/api/crm/cases/kpi/route";
import { GET as getCrmCases } from "@/app/api/crm/cases/route";
import { GET as getCrmChatHistory } from "@/app/api/crm/chat-history/route";
import { GET as getCrmChurn } from "@/app/api/crm/churn/route";
import { GET as getCrmCommunications } from "@/app/api/crm/communications/route";
import { GET as getCrmContacts } from "@/app/api/crm/contacts/route";
import { GET as getCrmContracts } from "@/app/api/crm/contracts/route";
import { GET as getCrmConversationSummaries } from "@/app/api/crm/conversation-summaries/route";
import { GET as getCrmDocuments } from "@/app/api/crm/documents/route";
import { GET as getCrmExpansion } from "@/app/api/crm/expansion/route";
import { GET as getCrmFieldVisits } from "@/app/api/crm/field-visits/route";
import { GET as getCrmHandoffs } from "@/app/api/crm/handoffs/route";
import { GET as getCrmHealth } from "@/app/api/crm/health/route";
import { GET as getCrmIntegrations } from "@/app/api/crm/integrations/route";
import { GET as getCrmLeads } from "@/app/api/crm/leads/route";
import { GET as getCrmNotifications } from "@/app/api/crm/notifications/route";
import { GET as getCrmOnboarding } from "@/app/api/crm/onboarding/route";
import { GET as getCrmOpportunitiesKpis } from "@/app/api/crm/opportunities/kpis/route";
import { GET as getCrmOpportunities } from "@/app/api/crm/opportunities/route";
import { GET as getCrmPipelineAnalytics } from "@/app/api/crm/pipeline/analytics/route";
import { GET as getCrmPipeline } from "@/app/api/crm/pipeline/route";
import { GET as getCrmQuotes } from "@/app/api/crm/quotes/route";
import { GET as getCrmRenewals } from "@/app/api/crm/renewals/route";
import { GET as getCrmReportsCampaigns } from "@/app/api/crm/reports/campaigns/route";
import { GET as getCrmReportsPipelineTrend } from "@/app/api/crm/reports/pipeline-trend/route";
import { GET as getCrmReportsRevenueTrend } from "@/app/api/crm/reports/revenue-trend/route";
import { GET as getCrmReportsRoi } from "@/app/api/crm/reports/roi/route";
import { GET as getCrmReportsRoiTrend } from "@/app/api/crm/reports/roi-trend/route";
import { GET as getCrmSearch } from "@/app/api/crm/search/route";
import { GET as getCrmTemplates } from "@/app/api/crm/templates/route";
import { GET as getCrmViews } from "@/app/api/crm/views/route";
import { GET as getDocumentIntelligence } from "@/app/api/document-intelligence/route";

// Helper to create mock query chains
function mockQueryChain(result: any) {
  const chain: any = {
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

describe("Batch 2: TC-0018 to TC-0106 Comprehensive Security & API Audit Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindMock.mockReturnValue(mockQueryChain([]));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section A: AI Usage, Authentication, Billing & Calendar
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Section A: AI Usage, Workspaces, Billing, Calendar", () => {
    it("TC-0018: Unauthenticated request to /api/ai/usage returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const res = await getAiUsage();
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it("TC-0018: Authenticated workspace retrieves usage with connectDB called", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-ai" },
      });
      orgFindOneMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          tier: "pro",
          isActive: true,
          subscriptionStatus: "active",
          settings: { ai: { usagePolicy: {} } },
        }),
      });

      const res = await getAiUsage();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(dbConnectMock).toHaveBeenCalled();
      expect(orgFindOneMock).toHaveBeenCalledWith(
        expect.objectContaining({ $or: [{ subdomain: "tenant-ai" }, { slug: "tenant-ai" }] }),
        expect.anything()
      );
    });

    it("TC-0020: Unauthenticated request to /api/auth/my-workspaces returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const res = await getMyWorkspaces();
      expect(res.status).toBe(401);
    });

    it("TC-0020: Authenticated user retrieves user-specific workspace memberships", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", email: "alice@acme.com", tenantId: "acme-corp" },
      });
      userFindMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { tenantId: "acme-corp", role: "admin" },
            { tenantId: "beta-corp", role: "sales" },
          ]),
        }),
      });
      orgFindMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { subdomain: "acme-corp", name: "Acme Corp" },
            { subdomain: "beta-corp", name: "Beta Corp" },
          ]),
        }),
      });

      const res = await getMyWorkspaces();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(2);
      expect(json.data[0].tenantId).toBe("acme-corp");
      expect(json.data[0].current).toBe(true);
      expect(userFindMock).toHaveBeenCalledWith({ email: "alice@acme.com" });
    });

    it("TC-0024: Unauthenticated request to /api/billing/history returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/billing/history");
      const res = await getBillingHistory(req);
      expect(res.status).toBe(401);
    });

    it("TC-0024: Non-admin role receives HTTP 403 Forbidden on billing history", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-billing", role: "sales" },
      });
      const req = new NextRequest("http://localhost:3000/api/billing/history");
      const res = await getBillingHistory(req);
      expect(res.status).toBe(403);
    });

    it("TC-0024: Admin retrieves tenant-scoped billing history", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-billing", role: "admin" },
      });
      subscriptionEventFindMock.mockReturnValue(mockQueryChain([{ id: "ev-1", amount: 100 }]));
      const req = new NextRequest("http://localhost:3000/api/billing/history");
      const res = await getBillingHistory(req);
      expect(res.status).toBe(200);
      expect(subscriptionEventFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-billing" })
      );
    });

    it("TC-0026: Unauthenticated request to /api/calendar/conflicts returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/calendar/conflicts");
      const res = await getCalendarConflicts(req);
      expect(res.status).toBe(401);
    });

    it("TC-0026: Authenticated request retrieves tenant calendar conflicts", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-cal", role: "admin" },
      });
      getCalendarEventsMock.mockResolvedValue([]);
      detectConflictsMock.mockReturnValue([]);

      const req = new NextRequest("http://localhost:3000/api/calendar/conflicts");
      const res = await getCalendarConflicts(req);
      expect(res.status).toBe(200);
      expect(getCalendarEventsMock).toHaveBeenCalledWith(
        "tenant-cal",
        "admin",
        expect.any(Date),
        expect.any(Date)
      );
    });

    it("TC-0028: Unauthenticated request to /api/calendar returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/calendar");
      const res = await getCalendar(req);
      expect(res.status).toBe(401);
    });

    it("TC-0028: Authenticated request retrieves tenant calendar events", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-cal", role: "sales" },
      });
      getCalendarEventsMock.mockResolvedValue([{ id: "ev-1", title: "Deal Review" }]);

      const req = new NextRequest("http://localhost:3000/api/calendar");
      const res = await getCalendar(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section B: CRM Routes (Accounts through Contracts)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Section B: CRM Core Entities", () => {
    it("TC-0030: Unauthenticated request to /api/crm/accounts returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/accounts");
      const res = await getCrmAccounts(req);
      expect(res.status).toBe(401);
    });

    it("TC-0030: Authenticated user retrieves tenant-scoped accounts with safe regex", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      accountFindMock.mockReturnValue(mockQueryChain([{ id: "acc-1", company_name: "Acme" }]));
      const req = new NextRequest("http://localhost:3000/api/crm/accounts?search=Acme+[Inc]");
      const res = await getCrmAccounts(req);
      expect(res.status).toBe(200);
      expect(accountFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm" })
      );
    });

    it("TC-0032: Unauthenticated request to /api/crm/activities returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/activities");
      const res = await getCrmActivities(req);
      expect(res.status).toBe(401);
    });

    it("TC-0032: Authenticated user retrieves tenant-scoped activities", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      activityFindMock.mockReturnValue(mockQueryChain([{ id: "act-1", subject: "Call" }]));
      const req = new NextRequest("http://localhost:3000/api/crm/activities");
      const res = await getCrmActivities(req);
      expect(res.status).toBe(200);
      expect(activityFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm" })
      );
    });

    it("TC-0034: Unauthenticated request to /api/crm/analytics returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/analytics");
      const res = await getCrmAnalytics(req);
      expect(res.status).toBe(401);
    });

    it("TC-0034: Authenticated user retrieves tenant-scoped analytics", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      oppCountDocumentsMock.mockResolvedValue(10);
      leadCountDocumentsMock.mockResolvedValue(25);
      accountCountDocumentsMock.mockResolvedValue(5);
      campaignCountDocumentsMock.mockResolvedValue(2);
      oppAggregateMock.mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/crm/analytics");
      const res = await getCrmAnalytics(req);
      expect(res.status).toBe(200);
      expect(oppCountDocumentsMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0036: Unauthenticated request to /api/crm/approval-policies returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const res = await getCrmApprovalPolicies();
      expect(res.status).toBe(401);
    });

    it("TC-0036: Authenticated admin retrieves approval policies", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "admin" },
      });
      approvalPolicyFindMock.mockReturnValue(mockQueryChain([{ id: "pol-1", name: "Standard" }]));
      const res = await getCrmApprovalPolicies();
      expect(res.status).toBe(200);
      expect(approvalPolicyFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0038: Unauthenticated request to /api/crm/approvals returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/approvals");
      const res = await getCrmApprovals(req);
      expect(res.status).toBe(401);
    });

    it("TC-0038: Authenticated user retrieves tenant approvals", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      approvalRequestFindMock.mockReturnValue(mockQueryChain([{ id: "appr-1", status: "pending" }]));
      const req = new NextRequest("http://localhost:3000/api/crm/approvals");
      const res = await getCrmApprovals(req);
      expect(res.status).toBe(200);
      expect(approvalRequestFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0040: Unauthenticated request to /api/crm/audit returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/audit");
      const res = await getCrmAudit(req);
      expect(res.status).toBe(401);
    });

    it("TC-0040: Authenticated user searches audit logs safely with escaped regex", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "admin" },
      });
      auditLogCountDocumentsMock.mockResolvedValue(1);
      auditLogFindMock.mockReturnValue(mockQueryChain([{ id: "aud-1", action: "created" }]));

      // Query with regex special characters [audit*]
      const req = new NextRequest("http://localhost:3000/api/crm/audit?search=[audit*]");
      const res = await getCrmAudit(req);
      expect(res.status).toBe(200);
      expect(auditLogFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm" })
      );
    });

    it("TC-0042: Unauthenticated request to /api/crm/automations returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/automations");
      const res = await getCrmAutomations(req);
      expect(res.status).toBe(401);
    });

    it("TC-0042: Authenticated admin retrieves automation rules", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "admin" },
      });
      automationRuleFindMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ id: "rule-1", name: "Auto Assign" }]),
      });
      const req = new NextRequest("http://localhost:3000/api/crm/automations");
      const res = await getCrmAutomations(req);
      expect(res.status).toBe(200);
      expect(automationRuleFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0044: Unauthenticated request to /api/crm/cases/kpi returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/cases/kpi");
      const res = await getCrmCasesKpi(req);
      expect(res.status).toBe(401);
    });

    it("TC-0044: Authenticated user calculates tenant-scoped case KPIs", async () => {
      authMock.mockResolvedValue({
        user: { id: "507f1f77bcf86cd799439011", tenantId: "tenant-crm", role: "sales" },
      });
      caseCountDocumentsMock.mockResolvedValue(5);
      caseAggregateMock.mockResolvedValue([]);
      caseFindMock.mockReturnValue(mockQueryChain([]));

      const req = new NextRequest("http://localhost:3000/api/crm/cases/kpi");
      const res = await getCrmCasesKpi(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.recentCases).toEqual([]);
      expect(caseCountDocumentsMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm" })
      );
      const aggregateOwnerId = caseAggregateMock.mock.calls[0][0][0].$match.$and[0].owner_id;
      expect(aggregateOwnerId.toHexString()).toBe("507f1f77bcf86cd799439011");
      expect(caseFindMock).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: "tenant-crm",
        owner_id: expect.objectContaining({ _bsontype: "ObjectId" }),
      }));
    });

    it("TC-0046: Unauthenticated request to /api/crm/cases returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/cases");
      const res = await getCrmCases(req);
      expect(res.status).toBe(401);
    });

    it("TC-0046: Authenticated user retrieves tenant-scoped cases", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      caseFindMock.mockReturnValue(mockQueryChain([{ id: "case-1", title: "Issue" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/cases");
      const res = await getCrmCases(req);
      expect(res.status).toBe(200);
      expect(caseFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm" })
      );
    });

    it("TC-0048: Unauthenticated request to /api/crm/chat-history returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/chat-history");
      const res = await getCrmChatHistory(req);
      expect(res.status).toBe(401);
    });

    it("TC-0048: Authenticated user retrieves their own tenant chat history", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      chatHistoryFindMock.mockReturnValue(mockQueryChain([{ id: "ch-1", title: "Lead Query" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/chat-history");
      const res = await getCrmChatHistory(req);
      expect(res.status).toBe(200);
      expect(chatHistoryFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u-1", tenantId: "tenant-crm", module: "crm" })
      );
    });

    it("TC-0050: Unauthenticated request to /api/crm/churn returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/churn");
      const res = await getCrmChurn(req);
      expect(res.status).toBe(401);
    });

    it("TC-0050: Authenticated user scans tenant churn risk", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      scanTenantChurnRiskMock.mockResolvedValue({ highRiskCount: 2 });

      const req = new NextRequest("http://localhost:3000/api/crm/churn");
      const res = await getCrmChurn(req);
      expect(res.status).toBe(200);
      expect(scanTenantChurnRiskMock).toHaveBeenCalledWith("tenant-crm", "u-1");
    });

    it("TC-0052: Unauthenticated request to /api/crm/communications returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/communications");
      const res = await getCrmCommunications(req);
      expect(res.status).toBe(401);
    });

    it("TC-0052: Authenticated user retrieves tenant communications", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      commFindMock.mockReturnValue(mockQueryChain([{ id: "comm-1", channel: "Email" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/communications");
      const res = await getCrmCommunications(req);
      expect(res.status).toBe(200);
      expect(commFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0054: Unauthenticated request to /api/crm/contacts returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/contacts");
      const res = await getCrmContacts(req);
      expect(res.status).toBe(401);
    });

    it("TC-0054: Authenticated user retrieves tenant contacts with stats", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      contactFindMock.mockReturnValue(mockQueryChain([{ id: "con-1", first_name: "Bob", createdAt: new Date() }]));

      const req = new NextRequest("http://localhost:3000/api/crm/contacts");
      const res = await getCrmContacts(req);
      expect(res.status).toBe(200);
      expect(contactFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0056: Unauthenticated request to /api/crm/contracts returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/contracts");
      const res = await getCrmContracts(req);
      expect(res.status).toBe(401);
    });

    it("TC-0056: Authenticated user retrieves tenant contracts", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      contractFindMock.mockReturnValue(mockQueryChain([{ id: "ctr-1", contract_number: "CTR-001" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/contracts");
      const res = await getCrmContracts(req);
      expect(res.status).toBe(200);
      expect(contractFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section C: Conversation Summaries & Documents (including TC-0057 & TC-0058)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Section C: Conversation Summaries & Documents", () => {
    it("TC-0058: Unauthenticated request to /api/crm/conversation-summaries returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/conversation-summaries");
      const res = await getCrmConversationSummaries(req);
      expect(res.status).toBe(401);
    });

    it("TC-0057: Authenticated request without query parameters returns tenant conversation summaries with HTTP 200", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      convSummaryFindMock.mockReturnValue(mockQueryChain([]));

      // No recordType or recordId query parameters provided
      const req = new NextRequest("http://localhost:3000/api/crm/conversation-summaries");
      const res = await getCrmConversationSummaries(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
      expect(dbConnectMock).toHaveBeenCalled();
      expect(convSummaryFindMock).toHaveBeenCalledWith({
        tenantId: "tenant-crm",
      });
    });

    it("TC-0057: Authenticated request with valid parameters connects to DB and retrieves summaries", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      convSummaryFindMock.mockReturnValue(mockQueryChain([{ id: "sum-1", summary: "Client agrees to discount" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/conversation-summaries?recordType=Opportunity&recordId=opp-123");
      const res = await getCrmConversationSummaries(req);
      expect(res.status).toBe(200);
      expect(dbConnectMock).toHaveBeenCalled();
      expect(convSummaryFindMock).toHaveBeenCalledWith({
        tenantId: "tenant-crm",
        recordType: "Opportunity",
        recordId: "opp-123",
      });
    });

    it("TC-0060: Unauthenticated request to /api/crm/documents returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/documents");
      const res = await getCrmDocuments(req);
      expect(res.status).toBe(401);
    });

    it("TC-0060: Authenticated user retrieves tenant-scoped documents", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      docFindMock.mockReturnValue(mockQueryChain([{ id: "doc-1", name: "Contract.pdf" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/documents");
      const res = await getCrmDocuments(req);
      expect(res.status).toBe(200);
      expect(docFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm", is_archived: false })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section D: Expansion, Field Visits, Health, Integrations, Leads
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Section D: Expansion, Field Visits, Health, Integrations, Leads", () => {
    it("TC-0062: Unauthenticated request to /api/crm/expansion returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/expansion");
      const res = await getCrmExpansion(req);
      expect(res.status).toBe(401);
    });

    it("TC-0062: Authenticated user retrieves tenant expansion forecast", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      computeExpansionForecastMock.mockResolvedValue({ projectedGrowth: 0.15 });

      const req = new NextRequest("http://localhost:3000/api/crm/expansion");
      const res = await getCrmExpansion(req);
      expect(res.status).toBe(200);
      expect(computeExpansionForecastMock).toHaveBeenCalledWith("tenant-crm", 12);
    });

    it("TC-0064: Unauthenticated request to /api/crm/field-visits returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/field-visits");
      const res = await getCrmFieldVisits(req);
      expect(res.status).toBe(401);
    });

    it("TC-0064: Authenticated user retrieves their tenant field visits", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      fieldVisitFindMock.mockReturnValue(mockQueryChain([{ id: "fv-1", visit_start: new Date() }]));

      const req = new NextRequest("http://localhost:3000/api/crm/field-visits");
      const res = await getCrmFieldVisits(req);
      expect(res.status).toBe(200);
      expect(fieldVisitFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm", createdBy: "u-1" })
      );
    });

    it("TC-0066: Unauthenticated request to /api/crm/handoffs returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/handoffs");
      const res = await getCrmHandoffs(req);
      expect(res.status).toBe(401);
    });

    it("TC-0066: Authenticated user retrieves tenant handoffs", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      handoffFindMock.mockReturnValue(mockQueryChain([{ id: "ho-1", recordId: "rec-1" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/handoffs");
      const res = await getCrmHandoffs(req);
      expect(res.status).toBe(200);
      expect(handoffFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0068: Unauthenticated request to /api/crm/health returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/health");
      const res = await getCrmHealth(req);
      expect(res.status).toBe(401);
    });

    it("TC-0068: Authenticated user retrieves tenant-wide health score distribution", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      accountFindMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          sort: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([{ company_name: "Acme", account_health_score: 85 }]),
          }),
        }),
      });

      const req = new NextRequest("http://localhost:3000/api/crm/health");
      const res = await getCrmHealth(req);
      expect(res.status).toBe(200);
      expect(accountFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0070: Unauthenticated request to /api/crm/integrations returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/integrations");
      const res = await getCrmIntegrations(req);
      expect(res.status).toBe(401);
    });

    it("TC-0070: Authenticated user retrieves tenant integrations", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      integrationLinkFindMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ id: "link-1", system: "SAP" }]),
      });

      const req = new NextRequest("http://localhost:3000/api/crm/integrations");
      const res = await getCrmIntegrations(req);
      expect(res.status).toBe(200);
      expect(integrationLinkFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0072: Unauthenticated request to /api/crm/leads returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/leads");
      const res = await getCrmLeads(req);
      expect(res.status).toBe(401);
    });

    it("TC-0072: Authenticated user retrieves tenant leads", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      leadFindMock.mockReturnValue(mockQueryChain([{ id: "lead-1", lead_name: "Jane Doe" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/leads");
      const res = await getCrmLeads(req);
      expect(res.status).toBe(200);
      expect(leadFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm" })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section E: Notifications, Onboarding, Opportunities, Pipeline
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Section E: Notifications, Onboarding, Opportunities, Pipeline", () => {
    it("TC-0074: Unauthenticated request to /api/crm/notifications returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/notifications");
      const res = await getCrmNotifications(req);
      expect(res.status).toBe(401);
    });

    it("TC-0074: Authenticated user retrieves user & tenant-scoped notifications", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      notifFindMock.mockReturnValue(mockQueryChain([{ id: "n-1", message: "Reminder" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/notifications");
      const res = await getCrmNotifications(req);
      expect(res.status).toBe(200);
      expect(notifFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm", userId: "u-1" });
    });

    it("TC-0076: Unauthenticated request to /api/crm/onboarding returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/onboarding");
      const res = await getCrmOnboarding(req);
      expect(res.status).toBe(401);
    });

    it("TC-0076: Authenticated user retrieves tenant onboarding plans", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      onboardingPlanFindMock.mockReturnValue(mockQueryChain([{ id: "ob-1", status: "Active" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/onboarding");
      const res = await getCrmOnboarding(req);
      expect(res.status).toBe(200);
      expect(onboardingPlanFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0078: Unauthenticated request to /api/crm/opportunities/kpis returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/opportunities/kpis");
      const res = await getCrmOpportunitiesKpis(req);
      expect(res.status).toBe(401);
    });

    it("TC-0078: Authenticated user retrieves tenant opportunity KPIs", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      oppAggregateMock.mockResolvedValue([{ totalPipelineValue: 50000 }]);

      const req = new NextRequest("http://localhost:3000/api/crm/opportunities/kpis");
      const res = await getCrmOpportunitiesKpis(req);
      expect(res.status).toBe(200);
      expect(oppAggregateMock).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { tenantId: "tenant-crm" } }])
      );
    });

    it("TC-0080: Unauthenticated request to /api/crm/opportunities returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/opportunities");
      const res = await getCrmOpportunities(req);
      expect(res.status).toBe(401);
    });

    it("TC-0080: Authenticated user retrieves tenant opportunities with safe search", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      oppFindMock.mockReturnValue(mockQueryChain([{ id: "opp-1", name: "Big Deal" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/opportunities?search=Big+[Deal]");
      const res = await getCrmOpportunities(req);
      expect(res.status).toBe(200);
      expect(oppFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm" })
      );
    });

    it("TC-0082: Unauthenticated request to /api/crm/pipeline/analytics returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/pipeline/analytics");
      const res = await getCrmPipelineAnalytics(req);
      expect(res.status).toBe(401);
    });

    it("TC-0082: Authenticated user retrieves tenant pipeline analytics", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      oppAggregateMock.mockResolvedValue([{ total_opportunities: 5, total_pipeline_value: 20000 }]);

      const req = new NextRequest("http://localhost:3000/api/crm/pipeline/analytics");
      const res = await getCrmPipelineAnalytics(req);
      expect(res.status).toBe(200);
      expect(oppAggregateMock).toHaveBeenCalledWith(
        expect.arrayContaining([{ $match: { tenantId: "tenant-crm" } }])
      );
    });

    it("TC-0084: Unauthenticated request to /api/crm/pipeline returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/pipeline");
      const res = await getCrmPipeline(req);
      expect(res.status).toBe(401);
    });

    it("TC-0084: Authenticated user retrieves tenant pipeline stage breakdown", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      oppAggregateMock.mockResolvedValue([{ _id: "Prospecting", count: 3, totalValue: 15000 }]);

      const req = new NextRequest("http://localhost:3000/api/crm/pipeline");
      const res = await getCrmPipeline(req);
      expect(res.status).toBe(200);
      expect(oppAggregateMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({ tenantId: "tenant-crm" }),
          }),
        ])
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section F: Quotes, Renewals, Reports, Search
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Section F: Quotes, Renewals, Reports, Search", () => {
    it("TC-0086: Unauthenticated request to /api/crm/quotes returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/quotes");
      const res = await getCrmQuotes(req);
      expect(res.status).toBe(401);
    });

    it("TC-0086: Authenticated user retrieves tenant quotes", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      quoteFindMock.mockReturnValue(mockQueryChain([{ id: "q-1", quote_number: "QT-101" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/quotes");
      const res = await getCrmQuotes(req);
      expect(res.status).toBe(200);
      expect(quoteFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm" })
      );
    });

    it("TC-0088: Unauthenticated request to /api/crm/renewals returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/renewals");
      const res = await getCrmRenewals(req);
      expect(res.status).toBe(401);
    });

    it("TC-0088: Authenticated user retrieves tenant renewal risk summary", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      getRenewalRiskSummaryMock.mockResolvedValue({ upcomingRenewals: 4 });

      const req = new NextRequest("http://localhost:3000/api/crm/renewals");
      const res = await getCrmRenewals(req);
      expect(res.status).toBe(200);
      expect(getRenewalRiskSummaryMock).toHaveBeenCalledWith("tenant-crm");
    });

    it("TC-0090: Unauthenticated request to /api/crm/reports/campaigns returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/reports/campaigns");
      const res = await getCrmReportsCampaigns(req);
      expect(res.status).toBe(401);
    });

    it("TC-0090: Unauthorized user without campaign.analytics receives HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales", permissions: [] },
      });
      const req = new NextRequest("http://localhost:3000/api/crm/reports/campaigns");
      const res = await getCrmReportsCampaigns(req);
      expect(res.status).toBe(403);
    });

    it("TC-0090: Authenticated user with campaign.analytics retrieves tenant campaign reports", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "admin", permissions: ["campaign.analytics"] },
      });
      campaignFindMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ id: "camp-1", status: "Active", roi_percentage: 120 }]),
      });
      getAttributionBreakdownByChannelMock.mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/crm/reports/campaigns");
      const res = await getCrmReportsCampaigns(req);
      expect(res.status).toBe(200);
      expect(campaignFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0092: Unauthenticated request to /api/crm/reports/pipeline-trend returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/reports/pipeline-trend");
      const res = await getCrmReportsPipelineTrend(req);
      expect(res.status).toBe(401);
    });

    it("TC-0092: Authenticated user retrieves tenant pipeline trend with clamped months", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      computePipelineTrendMock.mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/crm/reports/pipeline-trend?months=100");
      const res = await getCrmReportsPipelineTrend(req);
      expect(res.status).toBe(200);
      expect(computePipelineTrendMock).toHaveBeenCalledWith("tenant-crm", 24); // Clamped to 24 max
    });

    it("TC-0094: Unauthenticated request to /api/crm/reports/revenue-trend returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/reports/revenue-trend");
      const res = await getCrmReportsRevenueTrend(req);
      expect(res.status).toBe(401);
    });

    it("TC-0094: Authenticated user retrieves tenant revenue trend with clamped months", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      computeRevenueTrendMock.mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/crm/reports/revenue-trend?months=1");
      const res = await getCrmReportsRevenueTrend(req);
      expect(res.status).toBe(200);
      expect(computeRevenueTrendMock).toHaveBeenCalledWith("tenant-crm", 3); // Clamped to 3 min
    });

    it("TC-0096: Unauthenticated request to /api/crm/reports/roi returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/reports/roi");
      const res = await getCrmReportsRoi(req);
      expect(res.status).toBe(401);
    });

    it("TC-0096: Unauthorized user without campaign.analytics receives HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales", permissions: [] },
      });
      const req = new NextRequest("http://localhost:3000/api/crm/reports/roi");
      const res = await getCrmReportsRoi(req);
      expect(res.status).toBe(403);
    });

    it("TC-0096: Authenticated user with campaign.analytics retrieves tenant ROI metrics", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "admin", permissions: ["campaign.analytics"] },
      });
      calculateGlobalROIMock.mockResolvedValue({ globalRoi: 250 });

      const req = new NextRequest("http://localhost:3000/api/crm/reports/roi");
      const res = await getCrmReportsRoi(req);
      expect(res.status).toBe(200);
      expect(calculateGlobalROIMock).toHaveBeenCalledWith("tenant-crm");
    });

    it("TC-0098: Unauthenticated request to /api/crm/reports/roi-trend returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/reports/roi-trend");
      const res = await getCrmReportsRoiTrend(req);
      expect(res.status).toBe(401);
    });

    it("TC-0098: Authenticated user retrieves tenant ROI trend with clamped days", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      computeROITrendMock.mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/crm/reports/roi-trend?days=999");
      const res = await getCrmReportsRoiTrend(req);
      expect(res.status).toBe(200);
      expect(computeROITrendMock).toHaveBeenCalledWith("tenant-crm", 730); // Clamped to 730 max
    });

    it("TC-0100: Unauthenticated request to /api/crm/search returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/search");
      const res = await getCrmSearch(req);
      expect(res.status).toBe(401);
    });

    it("TC-0100: Search with < 2 characters returns empty array without querying database", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      const req = new NextRequest("http://localhost:3000/api/crm/search?q=a");
      const res = await getCrmSearch(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual([]);
      expect(leadFindMock).not.toHaveBeenCalled();
    });

    it("TC-0100: Search with valid query searches tenant records safely", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      leadFindMock.mockReturnValue(mockQueryChain([{ id: "l-1", lead_name: "Acme Lead" }]));
      accountFindMock.mockReturnValue(mockQueryChain([]));
      contactFindMock.mockReturnValue(mockQueryChain([]));
      oppFindMock.mockReturnValue(mockQueryChain([]));
      quoteFindMock.mockReturnValue(mockQueryChain([]));
      contractFindMock.mockReturnValue(mockQueryChain([]));
      caseFindMock.mockReturnValue(mockQueryChain([]));

      const req = new NextRequest("http://localhost:3000/api/crm/search?q=Acme+[Corporation]");
      const res = await getCrmSearch(req);
      expect(res.status).toBe(200);
      expect(leadFindMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "tenant-crm" })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section G: Templates & Views
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Section G: Templates & Views", () => {
    it("TC-0102: Unauthenticated request to /api/crm/templates returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/templates");
      const res = await getCrmTemplates(req);
      expect(res.status).toBe(401);
    });

    it("TC-0102: Authenticated user retrieves tenant message templates", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      templateFindMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ id: "tpl-1", title: "Welcome" }]),
      });

      const req = new NextRequest("http://localhost:3000/api/crm/templates");
      const res = await getCrmTemplates(req);
      expect(res.status).toBe(200);
      expect(templateFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });

    it("TC-0104: Unauthenticated request to /api/crm/views returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/crm/views");
      const res = await getCrmViews(req);
      expect(res.status).toBe(401);
    });

    it("TC-0104: Authenticated user retrieves their owned and shared tenant views", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "sales" },
      });
      viewFindMock.mockReturnValue(mockQueryChain([{ id: "view-1", name: "High Value Opps" }]));

      const req = new NextRequest("http://localhost:3000/api/crm/views?entity_type=Opportunity");
      const res = await getCrmViews(req);
      expect(res.status).toBe(200);
      expect(viewFindMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-crm",
          entity_type: "Opportunity",
          $or: [{ owner_id: "u-1" }, { is_shared: true }],
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section H: Document Intelligence (TC-0106)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Section H: Document Intelligence", () => {
    it("TC-0106: Unauthenticated request to /api/document-intelligence returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const res = await getDocumentIntelligence();
      expect(res.status).toBe(401);
    });

    it("TC-0106: Authenticated user retrieves tenant-scoped extracted documents", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-1", tenantId: "tenant-crm", role: "admin" },
      });
      extractedDocFindMock.mockReturnValue(mockQueryChain([{ id: "ed-1", name: "Invoice.pdf" }]));

      const res = await getDocumentIntelligence();
      expect(res.status).toBe(200);
      expect(extractedDocFindMock).toHaveBeenCalledWith({ tenantId: "tenant-crm" });
    });
  });
});
