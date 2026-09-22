// Side-effect registration of the cross-referenced Mongoose models.
//
// Serverless (Vercel) bundles load only what a route imports, so a route that
// does `.populate('account_id')` on a CrmCase throws MissingSchemaError unless
// CrmAccount happened to be imported too — which is why CRM lists (Cases,
// Contracts, Contacts, Support…) showed "Failed to load" in production while
// working locally after other pages had warmed the process. connectDB() pulls
// this in so every populate target is always registered.

import "@/models/crm/AIInsight";
import "@/models/crm/Account";
import "@/models/crm/Activity";
import "@/models/crm/ApprovalPolicy";
import "@/models/crm/ApprovalRequest";
import "@/models/crm/AutomationExecution";
import "@/models/crm/AutomationRule";
import "@/models/crm/Campaign";
import "@/models/crm/Case";
import "@/models/crm/Communication";
import "@/models/crm/Contact";
import "@/models/crm/Contract";
import "@/models/crm/ConversationSummary";
import "@/models/crm/CrmAuditLog";
import "@/models/crm/CrmDocument";
import "@/models/crm/FieldVisit";
import "@/models/crm/Handoff";
import "@/models/crm/IntegrationLink";
import "@/models/crm/Lead";
import "@/models/crm/MessageTemplate";
import "@/models/crm/Notification";
import "@/models/crm/OnboardingPlan";
import "@/models/crm/Opportunity";
import "@/models/crm/Permission";
import "@/models/crm/Quote";
import "@/models/crm/Role";
import "@/models/crm/SavedView";
import "@/models/crm/Task";
import "@/models/crm/WorkflowDefinition";
import "@/models/auth/User";
import "@/models/sales/Customer";
import "@/models/inventory/Product";
import "@/models/hr/Employee";
import "@/models/hr/Department";
