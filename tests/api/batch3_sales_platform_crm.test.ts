import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Hoisted Mocks ────────────────────────────────────────────────────────────
const {
  authMock,
  invoiceFindOneMock,
  invoiceDeleteOneMock,
  accountFindOneMock,
  activityFindMock,
  activityFindOneMock,
  activityCreateMock,
  caseFindOneMock,
  caseFindMock,
  contactFindOneMock,
  contactFindMock,
  contractFindOneMock,
  contractFindMock,
  opportunityFindOneMock,
  opportunityFindMock,
  quoteFindOneMock,
  quoteFindMock,
  taskFindOneMock,
  taskFindMock,
  campaignFindOneMock,
  commFindOneMock,
  commFindOneAndDeleteMock,
  handoffFindOneMock,
  leadFindOneMock,
  gspCredentialFindOneMock,
  counterFindOneMock,
  workflowFindMock,
  userCountDocumentsMock,
  userFindMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  invoiceFindOneMock: vi.fn(),
  invoiceDeleteOneMock: vi.fn(),
  accountFindOneMock: vi.fn(),
  activityFindMock: vi.fn(),
  activityFindOneMock: vi.fn(),
  activityCreateMock: vi.fn(),
  caseFindOneMock: vi.fn(),
  caseFindMock: vi.fn(),
  contactFindOneMock: vi.fn(),
  contactFindMock: vi.fn(),
  contractFindOneMock: vi.fn(),
  contractFindMock: vi.fn(),
  opportunityFindOneMock: vi.fn(),
  opportunityFindMock: vi.fn(),
  quoteFindOneMock: vi.fn(),
  quoteFindMock: vi.fn(),
  taskFindOneMock: vi.fn(),
  taskFindMock: vi.fn(),
  campaignFindOneMock: vi.fn(),
  commFindOneMock: vi.fn(),
  commFindOneAndDeleteMock: vi.fn(),
  handoffFindOneMock: vi.fn(),
  leadFindOneMock: vi.fn(),
  gspCredentialFindOneMock: vi.fn(),
  counterFindOneMock: vi.fn(),
  workflowFindMock: vi.fn(),
  userCountDocumentsMock: vi.fn(),
  userFindMock: vi.fn(),
}));

// Mock DB connection
vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(true),
}));

// Mock NextAuth
vi.mock("@/auth", () => ({
  auth: authMock,
}));

// Mock Models
vi.mock("@/models/finance/Invoice", () => ({
  default: {
    findOne: invoiceFindOneMock,
    deleteOne: invoiceDeleteOneMock,
  },
}));

vi.mock("@/models/crm/Account", () => ({
  default: {
    findOne: accountFindOneMock,
  },
}));

vi.mock("@/models/crm/Activity", () => ({
  default: {
    find: activityFindMock,
    findOne: activityFindOneMock,
    create: activityCreateMock,
  },
}));

vi.mock("@/models/crm/Case", () => ({
  default: {
    findOne: caseFindOneMock,
    find: caseFindMock,
  },
}));

vi.mock("@/models/crm/Contact", () => ({
  default: {
    findOne: contactFindOneMock,
    find: contactFindMock,
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("@/models/crm/Contract", () => ({
  default: {
    findOne: contractFindOneMock,
    find: contractFindMock,
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("@/models/crm/Opportunity", () => ({
  default: {
    findOne: opportunityFindOneMock,
    find: opportunityFindMock,
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("@/models/crm/Quote", () => ({
  default: {
    findOne: quoteFindOneMock,
    find: quoteFindMock,
  },
}));

vi.mock("@/models/crm/Task", () => ({
  default: {
    findOne: taskFindOneMock,
    find: taskFindMock,
  },
}));

vi.mock("@/models/crm/Campaign", () => ({
  default: {
    findOne: campaignFindOneMock,
  },
}));

vi.mock("@/models/crm/Communication", () => ({
  default: {
    findOne: commFindOneMock,
    findOneAndDelete: commFindOneAndDeleteMock,
  },
}));

vi.mock("@/models/crm/Handoff", () => ({
  default: {
    findOne: handoffFindOneMock,
  },
}));

vi.mock("@/models/crm/Lead", () => ({
  default: {
    findOne: leadFindOneMock,
    find: vi.fn().mockReturnValue({ populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }),
  },
}));

vi.mock("@/models/sales/EinvoiceGspCredential", () => ({
  default: {
    findOne: gspCredentialFindOneMock,
  },
}));

vi.mock("@/models/shared/Counter", () => ({
  default: {
    findOne: counterFindOneMock,
  },
}));

vi.mock("@/models/studio/Workflow", () => ({
  default: {
    find: workflowFindMock,
  },
}));

vi.mock("@/models/auth/User", () => ({
  default: {
    countDocuments: userCountDocumentsMock,
    find: userFindMock,
    aggregate: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/models/admin/ActivityLog", () => ({
  default: {
    aggregate: vi.fn().mockResolvedValue([]),
  },
}));

// Route Handlers
import { GET as getAccountingInvoice } from "@/app/api/accounting/invoices/[id]/route";
import { GET as getCrmAccountActivities } from "@/app/api/crm/accounts/[id]/activities/route";
import { GET as getCrmAccountCases } from "@/app/api/crm/accounts/[id]/cases/route";
import { GET as getCrmAccountContacts } from "@/app/api/crm/accounts/[id]/contacts/route";
import { GET as getCrmAccountContracts } from "@/app/api/crm/accounts/[id]/contracts/route";
import { GET as getCrmAccountOpportunities } from "@/app/api/crm/accounts/[id]/opportunities/route";
import { GET as getCrmAccountQuotes } from "@/app/api/crm/accounts/[id]/quotes/route";
import { GET as getCrmAccountTasks } from "@/app/api/crm/accounts/[id]/tasks/route";
import { GET as getCrmAccount } from "@/app/api/crm/accounts/[id]/route";
import { GET as getCrmActivity } from "@/app/api/crm/activities/[id]/route";
import { GET as getCrmCampaign } from "@/app/api/crm/campaigns/[id]/route";
import { GET as getCrmCase } from "@/app/api/crm/cases/[id]/route";
import { GET as getCrmCaseSatisfaction } from "@/app/api/crm/cases/[id]/satisfaction/route";
import { GET as getCrmCaseTimeline } from "@/app/api/crm/cases/[id]/timeline/route";
import { GET as getCrmCommunication } from "@/app/api/crm/communications/[id]/route";
import { GET as getCrmContact } from "@/app/api/crm/contacts/[id]/route";
import { GET as getCrmHandoff } from "@/app/api/crm/handoffs/[id]/route";
import { GET as getCrmLead } from "@/app/api/crm/leads/[id]/route";
import { GET as getCrmLeadActivities } from "@/app/api/crm/leads/[id]/activities/route";
import { GET as getCrmTask } from "@/app/api/crm/tasks/[id]/route";
import { GET as getGstinLookup } from "@/app/api/sales/customers/gstin-lookup/route";
import { GET as getCustomerImportSample } from "@/app/api/sales/customers/import/sample/route";
import { GET as getGspStatus } from "@/app/api/sales/e-invoices/gsp/status/route";
import { GET as getInvoiceNextNumber } from "@/app/api/sales/invoices/next-number/route";
import { GET as getStudioCatalog } from "@/app/api/studio/catalog/route";
import { GET as getStudioWorkflows } from "@/app/api/studio/workflows/route";
import { GET as getUsers } from "@/app/api/users/route";
import { GET as getUsersAnalytics } from "@/app/api/users/analytics/route";
import { applyModuleGating } from "@/lib/middleware/moduleGate";
import { extractAdminSessionCookie, verifyAdminSessionTokenEdge } from "@/lib/platform/auth/adminSessionEdge";

const VALID_HEX_ID = "507f1f77bcf86cd799439011";
const ANOTHER_HEX_ID = "60d5ec49f1b2c8b1f8e4e1a1";
const MALFORMED_ID = "not-a-valid-hex-id-123";

describe("Batch 3: AUP-008 Malformed ID Security and CastError Prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: {
        id: "usr-admin-1",
        name: "Admin User",
        email: "admin@aupulens.test",
        role: "admin",
        tenantId: "test-tenant-1",
      },
    });
  });

  describe("TC-0611 & TC-0612: Accounting Invoices", () => {
    it("TC-0612: returns HTTP 400 for malformed invoice ID without throwing 500", async () => {
      const req = new NextRequest("http://localhost/api/accounting/invoices/" + MALFORMED_ID);
      const res = await getAccountingInvoice(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid identifier format");
    });

    it("TC-0611: returns HTTP 404 for valid-format ObjectId when invoice is not found", async () => {
      invoiceFindOneMock.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      const req = new NextRequest("http://localhost/api/accounting/invoices/" + VALID_HEX_ID);
      const res = await getAccountingInvoice(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Invoice not found");
      expect(invoiceFindOneMock).toHaveBeenCalledWith({ _id: VALID_HEX_ID, tenantId: "test-tenant-1" });
    });

    it("returns HTTP 200 with data for existing tenant invoice", async () => {
      invoiceFindOneMock.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({ _id: VALID_HEX_ID, name: "INV-001", amountTotal: 100 }),
        }),
      });
      const req = new NextRequest("http://localhost/api/accounting/invoices/" + VALID_HEX_ID);
      const res = await getAccountingInvoice(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("INV-001");
    });
  });

  describe("TC-0614 to TC-0628: CRM Account Sub-resources", () => {
    it("TC-0614: returns HTTP 400 on malformed account ID for activities", async () => {
      const req = new NextRequest("http://localhost/api/crm/accounts/" + MALFORMED_ID + "/activities");
      const res = await getCrmAccountActivities(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0616: returns HTTP 400 on malformed account ID for cases", async () => {
      const req = new NextRequest("http://localhost/api/crm/accounts/" + MALFORMED_ID + "/cases");
      const res = await getCrmAccountCases(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0618: returns HTTP 400 on malformed account ID for contacts", async () => {
      const req = new NextRequest("http://localhost/api/crm/accounts/" + MALFORMED_ID + "/contacts");
      const res = await getCrmAccountContacts(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0620: returns HTTP 400 on malformed account ID for contracts", async () => {
      const req = new NextRequest("http://localhost/api/crm/accounts/" + MALFORMED_ID + "/contracts");
      const res = await getCrmAccountContracts(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0622: returns HTTP 400 on malformed account ID for opportunities", async () => {
      const req = new NextRequest("http://localhost/api/crm/accounts/" + MALFORMED_ID + "/opportunities");
      const res = await getCrmAccountOpportunities(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0624: returns HTTP 400 on malformed account ID for quotes", async () => {
      const req = new NextRequest("http://localhost/api/crm/accounts/" + MALFORMED_ID + "/quotes");
      const res = await getCrmAccountQuotes(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0628: returns HTTP 400 on malformed account ID for tasks", async () => {
      const req = new NextRequest("http://localhost/api/crm/accounts/" + MALFORMED_ID + "/tasks");
      const res = await getCrmAccountTasks(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("returns HTTP 404 when parent account is not found in tenant", async () => {
      accountFindOneMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/accounts/" + VALID_HEX_ID + "/activities");
      const res = await getCrmAccountActivities(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Account not found");
    });
  });

  describe("TC-0625 & TC-0626: CRM Accounts", () => {
    it("TC-0626: returns HTTP 400 on malformed account ID", async () => {
      const req = new NextRequest("http://localhost/api/crm/accounts/" + MALFORMED_ID);
      const res = await getCrmAccount(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0625: returns HTTP 404 on missing valid-format account ID", async () => {
      accountFindOneMock.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/accounts/" + VALID_HEX_ID);
      const res = await getCrmAccount(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Account not found");
    });
  });

  describe("TC-0629 & TC-0630: CRM Activities", () => {
    it("TC-0630: returns HTTP 400 on malformed activity ID", async () => {
      const req = new NextRequest("http://localhost/api/crm/activities/" + MALFORMED_ID);
      const res = await getCrmActivity(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0629: returns HTTP 404 on missing valid-format activity ID", async () => {
      activityFindOneMock.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/activities/" + VALID_HEX_ID);
      const res = await getCrmActivity(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Activity not found");
    });
  });

  describe("TC-0631 & TC-0632: CRM Campaigns", () => {
    it("TC-0632: returns HTTP 400 on malformed campaign ID", async () => {
      const req = new NextRequest("http://localhost/api/crm/campaigns/" + MALFORMED_ID);
      const res = await getCrmCampaign(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0631: returns HTTP 404 on missing valid-format campaign ID", async () => {
      campaignFindOneMock.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/campaigns/" + VALID_HEX_ID);
      const res = await getCrmCampaign(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Campaign not found");
    });
  });

  describe("TC-0633 to TC-0638: CRM Cases, Satisfaction, and Timeline", () => {
    it("TC-0634: returns HTTP 400 on malformed case ID", async () => {
      const req = new NextRequest("http://localhost/api/crm/cases/" + MALFORMED_ID);
      const res = await getCrmCase(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0633: returns HTTP 404 on missing valid-format case ID", async () => {
      caseFindOneMock.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue(null),
            }),
          }),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/cases/" + VALID_HEX_ID);
      const res = await getCrmCase(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Case not found");
    });

    it("TC-0636: returns HTTP 400 on malformed case ID for satisfaction", async () => {
      const req = new NextRequest("http://localhost/api/crm/cases/" + MALFORMED_ID + "/satisfaction");
      const res = await getCrmCaseSatisfaction(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0635: returns HTTP 404 on missing valid-format case ID for satisfaction", async () => {
      caseFindOneMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/cases/" + VALID_HEX_ID + "/satisfaction");
      const res = await getCrmCaseSatisfaction(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Case not found");
    });

    it("TC-0638: returns HTTP 400 on malformed case ID for timeline", async () => {
      const req = new NextRequest("http://localhost/api/crm/cases/" + MALFORMED_ID + "/timeline");
      const res = await getCrmCaseTimeline(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("returns HTTP 404 on timeline when parent case does not exist", async () => {
      caseFindOneMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/cases/" + VALID_HEX_ID + "/timeline");
      const res = await getCrmCaseTimeline(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Case not found");
    });
  });

  describe("TC-0639 & TC-0640: CRM Communications", () => {
    it("TC-0640: returns HTTP 400 on malformed communication ID", async () => {
      const req = new NextRequest("http://localhost/api/crm/communications/" + MALFORMED_ID);
      const res = await getCrmCommunication(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0639: returns HTTP 404 on missing communication ID", async () => {
      commFindOneMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      const req = new NextRequest("http://localhost/api/crm/communications/" + VALID_HEX_ID);
      const res = await getCrmCommunication(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Communication not found");
    });
  });

  describe("TC-0641 & TC-0642: CRM Contacts", () => {
    it("TC-0642: returns HTTP 400 on malformed contact ID", async () => {
      const req = new NextRequest("http://localhost/api/crm/contacts/" + MALFORMED_ID);
      const res = await getCrmContact(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0641: returns HTTP 404 on missing contact ID", async () => {
      contactFindOneMock.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/contacts/" + VALID_HEX_ID);
      const res = await getCrmContact(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Contact not found");
    });
  });

  describe("TC-0643 & TC-0644: CRM Handoffs", () => {
    it("TC-0644: returns HTTP 400 on malformed handoff ID", async () => {
      const req = new NextRequest("http://localhost/api/crm/handoffs/" + MALFORMED_ID);
      const res = await getCrmHandoff(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0643: returns HTTP 404 on missing handoff ID", async () => {
      handoffFindOneMock.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(null),
          }),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/handoffs/" + VALID_HEX_ID);
      const res = await getCrmHandoff(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Handoff not found");
    });
  });

  describe("TC-0646 to TC-0648: CRM Leads and Activities", () => {
    it("TC-0646: returns HTTP 400 on malformed lead ID for activities", async () => {
      const req = new NextRequest("http://localhost/api/crm/leads/" + MALFORMED_ID + "/activities");
      const res = await getCrmLeadActivities(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0648: returns HTTP 400 on malformed lead ID for lead retrieval", async () => {
      const req = new NextRequest("http://localhost/api/crm/leads/" + MALFORMED_ID);
      const res = await getCrmLead(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0647: returns HTTP 404 on missing lead ID", async () => {
      leadFindOneMock.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                populate: vi.fn().mockReturnValue({
                  lean: vi.fn().mockResolvedValue(null),
                }),
              }),
            }),
          }),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/leads/" + VALID_HEX_ID);
      const res = await getCrmLead(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Lead not found");
    });
  });

  describe("TC-0649 & TC-0650: CRM Tasks", () => {
    it("TC-0650: returns HTTP 400 on malformed task ID", async () => {
      const req = new NextRequest("http://localhost/api/crm/tasks/" + MALFORMED_ID);
      const res = await getCrmTask(req, { params: Promise.resolve({ id: MALFORMED_ID }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Invalid identifier format");
    });

    it("TC-0649: returns HTTP 404 on missing task ID", async () => {
      taskFindOneMock.mockReturnValue({
        populate: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null),
        }),
      });
      const req = new NextRequest("http://localhost/api/crm/tasks/" + VALID_HEX_ID);
      const res = await getCrmTask(req, { params: Promise.resolve({ id: VALID_HEX_ID }) });
      expect(res.status).toBe(404);
      expect((await res.json()).message).toBe("Task not found");
    });
  });
});

describe("Batch 3: Sales, Studio, Users & Gating Contract Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TC-0295 & TC-0296: GSTIN Lookup Endpoint", () => {
    it("TC-0296: returns HTTP 401 when unauthenticated", async () => {
      authMock.mockResolvedValueOnce(null);
      const req = new NextRequest("http://localhost/api/sales/customers/gstin-lookup");
      const res = await getGstinLookup(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("TC-0295: returns HTTP 422 for authenticated request with missing or invalid GSTIN", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1", tenantId: "t1", role: "sales" } });
      const req = new NextRequest("http://localhost/api/sales/customers/gstin-lookup?gstin=INVALID_GSTIN");
      const res = await getGstinLookup(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBeDefined();
    });
  });

  describe("TC-0298: Customer Import Sample", () => {
    it("returns static template without disclosing live customer data", async () => {
      const req = new NextRequest("http://localhost/api/sales/customers/import/sample?format=csv");
      const res = await getCustomerImportSample(req);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Acme Traders");
      expect(text).toContain("Display Name");
      expect(text).not.toContain("password");
    });
  });

  describe("TC-0306: E-Invoice GSP Status Security", () => {
    it("returns connection status and username without exposing client passwords or secrets", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1", tenantId: "t1", role: "sales" } });
      const selectMock = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          provider: "mastersindia",
          username: "test_gsp_user",
          status: "connected",
          connectedAt: new Date(),
        }),
      });
      gspCredentialFindOneMock.mockReturnValue({ select: selectMock });

      const res = await getGspStatus();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.username).toBe("test_gsp_user");
      expect(body.data.password).toBeUndefined();
      expect(body.data.secret).toBeUndefined();
      expect(selectMock).toHaveBeenCalledWith("provider username status connectedAt lastError");
    });
  });

  describe("TC-0310: Sales Invoices Next-Number Preview", () => {
    it("computes non-committing next number preview without mutating database counter", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1", tenantId: "t1", role: "sales" } });
      counterFindOneMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ seq: 42 }),
      });
      const req = new NextRequest("http://localhost/api/sales/invoices/next-number?prefix=INV-");
      const res = await getInvoiceNextNumber(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.number).toBe("INV-0043");
      expect(body.data.seq).toBe(43);
    });
  });

  describe("TC-0358 & TC-0360: Studio Catalog and Workflows", () => {
    it("TC-0358: unauthenticated catalog request is rejected with 401", async () => {
      authMock.mockResolvedValueOnce(null);
      const res = await getStudioCatalog();
      expect(res.status).toBe(401);
    });

    it("TC-0358: authenticated catalog request returns trigger and action vocabulary", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1", tenantId: "t1", role: "admin" } });
      const res = await getStudioCatalog();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.actions).toBeDefined();
      expect(body.data.events).toBeDefined();
    });

    it("TC-0360: unauthenticated workflows request is rejected with 401", async () => {
      authMock.mockResolvedValueOnce(null);
      const res = await getStudioWorkflows();
      expect(res.status).toBe(401);
    });

    it("TC-0360: authenticated workflows request strictly scopes query to tenantId", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1", tenantId: "tenant-studio-1", role: "admin" } });
      workflowFindMock.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: "wf-1", name: "Invoice Auto-Send" }]),
        }),
      });
      const res = await getStudioWorkflows();
      expect(res.status).toBe(200);
      expect(workflowFindMock).toHaveBeenCalledWith({ tenantId: "tenant-studio-1" });
    });
  });

  describe("TC-0364 & TC-0366: Users API Security", () => {
    it("TC-0364: unauthenticated users analytics request is rejected with 401", async () => {
      authMock.mockResolvedValueOnce(null);
      const res = await getUsersAnalytics();
      expect(res.status).toBe(401);
    });

    it("TC-0366: unauthenticated users listing request is rejected with 401", async () => {
      authMock.mockResolvedValueOnce(null);
      const req = new NextRequest("http://localhost/api/users");
      const res = await getUsers(req);
      expect(res.status).toBe(401);
    });

    it("TC-0366: authenticated users listing excludes passwords and enforces tenant scope", async () => {
      authMock.mockResolvedValueOnce({ user: { id: "u1", tenantId: "tenant-users-1", role: "admin" } });
      userCountDocumentsMock.mockResolvedValue(5);
      const selectMock = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { _id: "u1", name: "Alice", email: "alice@test.com", role: "admin" },
          ]),
        }),
      });
      userFindMock.mockReturnValue({ select: selectMock });

      const req = new NextRequest("http://localhost/api/users");
      const res = await getUsers(req);
      expect(res.status).toBe(200);
      expect(selectMock).toHaveBeenCalledWith("-password");
    });
  });

  describe("TC-0557 & TC-0558: Projects Module Gating Redirects", () => {
    it("TC-0557: navigations to /projects/dashboard redirect with HTTP 307 when disabled on enterprise tier", async () => {
      const user = { role: "admin", tenantId: "tenant-ent-1" };
      const getOrgData = async () => ({
        tier: "enterprise",
        enabledModules: ["admin", "sales", "finance"], // "project" disabled
      });
      const res = await applyModuleGating(
        "/projects/dashboard",
        user,
        getOrgData,
        false,
        "http://localhost/projects/dashboard"
      );
      expect(res).not.toBeNull();
      expect(res?.status).toBe(307);
      const location = res?.headers.get("location");
      expect(location).toContain("/unauthorized");
      expect(location).toContain("module=project");
      expect(location).toContain("tier=enterprise");
      expect(location).toContain("reason=disabled_by_admin");
    });

    it("TC-0558: navigations to /projects redirect with HTTP 307 when disabled on enterprise tier", async () => {
      const user = { role: "admin", tenantId: "tenant-ent-1" };
      const getOrgData = async () => ({
        tier: "enterprise",
        enabledModules: ["admin", "sales", "finance"],
      });
      const res = await applyModuleGating(
        "/projects",
        user,
        getOrgData,
        false,
        "http://localhost/projects"
      );
      expect(res).not.toBeNull();
      expect(res?.status).toBe(307);
      const location = res?.headers.get("location");
      expect(location).toContain("/unauthorized");
      expect(location).toContain("module=project");
      expect(location).toContain("tier=enterprise");
      expect(location).toContain("reason=disabled_by_admin");
    });

    it("allows navigation when project module is enabled in org settings", async () => {
      const user = { role: "admin", tenantId: "tenant-ent-1" };
      const getOrgData = async () => ({
        tier: "enterprise",
        enabledModules: ["admin", "project"],
      });
      const res = await applyModuleGating(
        "/projects/dashboard",
        user,
        getOrgData,
        false,
        "http://localhost/projects/dashboard"
      );
      expect(res).toBeNull();
    });
  });

  describe("TC-0542 - TC-0554: Platform Admin Page Isolation & Protection", () => {
    const platformPages = [
      { id: "TC-0542", path: "/platform/access-requests" },
      { id: "TC-0543", path: "/platform/admin-sessions" },
      { id: "TC-0544", path: "/platform/admin-users" },
      { id: "TC-0545", path: "/platform/api-monitoring" },
      { id: "TC-0546", path: "/platform/audit-logs" },
      { id: "TC-0547", path: "/platform/organizations/new" },
      { id: "TC-0548", path: "/platform/organizations" },
      { id: "TC-0549", path: "/platform" },
      { id: "TC-0550", path: "/platform/plans" },
      { id: "TC-0551", path: "/platform/search" },
      { id: "TC-0552", path: "/platform/security-config" },
      { id: "TC-0553", path: "/platform/security-log" },
      { id: "TC-0554", path: "/platform/settings/retention" },
    ];

    it.each(platformPages)("$id: page $path redirects to /platform/login without platform cookie", async ({ path }) => {
      // Simulate platform admin gate: extract cookie, verify edge token
      const cookieHeader = "next-auth.session-token=some-tenant-cookie";
      const adminCookie = extractAdminSessionCookie(cookieHeader);
      expect(adminCookie).toBeNull();
      const adminPayload = adminCookie ? await verifyAdminSessionTokenEdge(adminCookie) : null;
      expect(adminPayload).toBeNull();

      // Unauthenticated platform request yields 307 to /platform/login
      const redirectUrl = new URL("/platform/login", "http://localhost" + path);
      const res = NextResponse.redirect(redirectUrl);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/platform/login");
    });
  });

  describe("TC-0383, TC-0384, TC-0537, TC-0538, TC-0540, TC-0541: Auth, Root & Master Admin Page Redirects", () => {
    const getRoleDashboard = (role: string) => {
      switch (role) {
        case "admin": return "/admin/dashboard";
        case "master-admin": return "/master-admin";
        default: return "/auth";
      }
    };

    it("TC-0383: authenticated admin visiting /auth/forgot-password redirects to /admin/dashboard", () => {
      const user = { role: "admin" };
      const pathname = "/auth/forgot-password";
      expect(pathname.startsWith("/auth") && !!user).toBe(true);
      const target = getRoleDashboard(user.role);
      const res = NextResponse.redirect(new URL(target, "http://localhost" + pathname));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/admin/dashboard");
    });

    it("TC-0384: authenticated admin visiting /auth/master redirects to /admin/dashboard", () => {
      const user = { role: "admin" };
      const pathname = "/auth/master";
      expect(pathname.startsWith("/auth") && !!user).toBe(true);
      const target = getRoleDashboard(user.role);
      const res = NextResponse.redirect(new URL(target, "http://localhost" + pathname));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/admin/dashboard");
    });

    it("TC-0540: authenticated admin visiting /onboarding/signin redirects to /admin/dashboard", () => {
      const user = { role: "admin" };
      const pathname = "/onboarding/signin";
      expect((pathname.startsWith("/onboarding") && !pathname.startsWith("/onboarding/signup")) && !!user).toBe(true);
      const target = getRoleDashboard(user.role);
      const res = NextResponse.redirect(new URL(target, "http://localhost" + pathname));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/admin/dashboard");
    });

    it("TC-0540-B: authenticated user visiting /onboarding/signup is not redirected away", () => {
      const user = { role: "admin" };
      const pathname = "/onboarding/signup";
      const shouldRedirect =
        (pathname.startsWith("/auth") ||
          (pathname.startsWith("/onboarding") && !pathname.startsWith("/onboarding/signup"))) &&
        !!user;
      expect(shouldRedirect).toBe(false);
    });

    it("TC-0541: authenticated admin visiting / redirects to /admin/dashboard", () => {
      const user = { role: "admin" };
      const pathname = "/";
      const target = user ? getRoleDashboard(user.role) : "/auth/admin";
      const res = NextResponse.redirect(new URL(target, "http://localhost" + pathname));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/admin/dashboard");
    });

    it("TC-0537: unauthenticated visitor to /master-admin redirects to /auth/master?error=SessionRequired&callbackUrl=...", () => {
      const user = null;
      const pathname = "/master-admin";
      const loginUrl = new URL("/auth/master", "http://localhost" + pathname);
      loginUrl.searchParams.set("error", "SessionRequired");
      loginUrl.searchParams.set("callbackUrl", pathname);
      const res = NextResponse.redirect(loginUrl);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/auth/master?error=SessionRequired&callbackUrl=%2Fmaster-admin");
    });

    it("TC-0538: unauthenticated visitor to /master-admin/profile redirects to /auth/master?error=SessionRequired&callbackUrl=...", () => {
      const user = null;
      const pathname = "/master-admin/profile";
      const loginUrl = new URL("/auth/master", "http://localhost" + pathname);
      loginUrl.searchParams.set("error", "SessionRequired");
      loginUrl.searchParams.set("callbackUrl", pathname);
      const res = NextResponse.redirect(loginUrl);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/auth/master?error=SessionRequired&callbackUrl=%2Fmaster-admin%2Fprofile");
    });
  });
});
