# Global Aupulens ERP — Admin Control Plane
## Platform Governance, Tenant Architecture & System Specifications

> **This is the authoritative source specification for the Global Admin control plane.**
> Save at `docs/admin/SOURCE-SPEC.md`. Every coverage claim is measured against this document.

---

## 1. Purpose

The Global Admin Module is the central administration and governance layer for the Aupulens ERP
platform. It enables Aupulens platform administrators to:

- Create, onboard, suspend, and manage client organisations.
- Manage organisation hierarchy and organisation types.
- Assign and modify subscription tiers/plans.
- Control feature entitlements based on subscription.
- Monitor AI usage and AI-related costs.
- Define and enforce AI usage limits.
- Monitor platform-wide activity.
- Maintain audit logs for every organisation and user action.
- Monitor system, security, billing, AI, and administrative events.
- Access organisation-level information without becoming the organisation's operational administrator.
- Manage platform-wide configurations.
- Detect abnormal usage, security events, and potential abuse.

## 2. Global Admin Hierarchy

The system should maintain a strict separation between Global Aupulens Administration and Client
Organisation Administration.

```
Aupulens Platform
  ├── Global Admin
  │    ├── Organisation Management
  │    ├── Subscription / Tier Management
  │    ├── AI Usage Management
  │    ├── Platform Configuration
  │    ├── Security & Access
  │    ├── Global Audit Logs
  │    └── Platform Monitoring
  └── Client Organisations
       ├── Organisation Admin
       ├── Managers
       ├── Employees
       ├── Accountants
       ├── HR
       └── Other Users
```

**Note:** Global Admin operates above the organisation level.

## 3. Organisation Management

Global Admin must have a dedicated Organisations section.

### Organisation List — display all organisations registered on Aupulens

| Field | Description |
|---|---|
| Organisation ID | Unique platform identifier |
| Organisation Name | Registered business name |
| Organisation Type | SME, Enterprise, Accountant, etc. |
| Country | Primary operating country |
| Region | State/province where applicable |
| Subscription | Current plan |
| Status | Active / Trial / Suspended / Cancelled |
| Users | Number of active users |
| AI Usage | Current-period AI consumption |
| Usage % | Consumption against plan |
| Created Date | Organisation creation date |
| Last Activity | Last meaningful platform activity |

### Organisation Status

Organisation should support: `INVITED`, `ONBOARDING`, `TRIAL`, `ACTIVE`, `SUSPENDED`,
`PAYMENT_HOLD`, `CANCELLED`, `ARCHIVED`.

**Rule:** Status transitions must be logged.

## 4. Organisation Types

Aupulens must support multiple organisation classifications:

```
Organisation
  ├── SME
  ├── Enterprise
  ├── Startup
  ├── Accountant / CA Firm
  ├── Multi-Company Group
  ├── Non-Profit
  ├── Educational
  └── Custom
```

The organisation type should influence: available modules, default configuration, user roles,
reporting, subscription eligibility, AI limits, compliance configuration, billing configuration.

Global Admin should be able to configure organisation types from the platform configuration layer.

## 5. Create Organisation

Global Admin can manually create an organisation.

**Required Information** — Organisation Information: Legal Name, Display Name, Organisation Type,
Country, Currency, Timezone, Tax Jurisdiction, Primary Contact, Email, Phone, Subscription Plan.

**System-generated Information:** Organisation ID, Tenant ID, Created At, Created By, Initial Status.

**Default Configuration:** The organisation must receive a unique Tenant ID. This Tenant ID becomes
the primary isolation boundary for all organisation data.

## 6. Multi-Tenant Isolation

This is critical. Every organisation must operate inside an isolated tenant context. All major
entities should contain an organisation/tenant reference.

```
Organisation → Tenant ID → Users, Customers, Suppliers, Products, Invoices, Bills,
                           Transactions, Employees, Documents, AI Requests, Audit Logs,
                           Reports, Settings
```

**Rule:** No organisation user should be able to access another organisation's data unless an
explicitly authorised Global Admin operation allows it. Global Admin access should itself be logged.

## 7. Organisation Details

Clicking an organisation should open an organisation-level control panel.

**Organisation Overview:** Organisation Name, Organisation ID, Plan, Status, Country, Created Date,
Active Users, Storage, AI Usage, Monthly Revenue, Last Activity.

**Tabs:** Overview, Users, Subscription, AI Usage, Modules, Configuration, Activity, Audit Logs,
Security, Billing, Usage.

## 8. Subscription / Tier Management

Global Admin must be able to manage subscription plans.

**Example plans:** FREE, STARTER, GROWTH, PRO, BUSINESS, ENTERPRISE, CUSTOM.

**Plan Configuration:** Price, Billing Cycle, Maximum Users, Maximum Companies, Storage, API
Requests, AI Credits, AI Requests, Available Modules, Automation Limits, Document Limits, Support
Level, Feature Flags.

## 9. Plan Assignment

Global Admin can assign a plan to an organisation.

```
Organisation: ABC Trading Pvt Ltd
Current Plan: Growth
Change Plan:  Pro
Effective:    Immediately / Next Billing Cycle
```

**System Records:** Previous Plan, New Plan, Changed By, Changed At, Reason, Effective Date.

**Important:** Changing a plan must not delete data. If an organisation downgrades:
- Existing data remains intact.
- Restricted modules become read-only or unavailable according to business rules.
- New transactions may be blocked if required.
- Existing reports should remain accessible where appropriate.

## 10. Feature Entitlements

Plans should not be hard-coded throughout the application. Use a central entitlement system.

```json
{
  "PLAN_PRO": {
    "modules": {
      "accounting": true, "inventory": true, "hr": true,
      "payroll": true, "crm": true,
      "ai_assistant": true, "ai_automation": true
    },
    "limits": { "users": 50, "companies": 5, "ai_credits": 100000, "storage_gb": 100 }
  }
}
```

This allows Global Admin to change plan capabilities without modifying application logic.

## 11. Custom Enterprise Plans

Global Admin should be able to create a custom plan for enterprise customers.

**Example Enterprise Customer Settings:** Users: Unlimited · Companies: 25 · Storage: 2 TB ·
AI Credits: 5,000,000 · API Calls: 1,000,000/month · Modules: Accounting, Inventory, HR, Payroll,
CRM, AI Automation, Custom Reports, API.

Custom entitlements must override the standard plan where applicable.

## 12. AI Usage Management

AI should be treated as a metered platform resource. Global Admin must have visibility into:
AI requests, AI tokens, AI credits, model usage, AI automation execution, AI document processing,
AI agent usage, AI API consumption, estimated AI cost.

## 13. AI Usage Dashboard

Global Admin dashboard should provide: Total AI Requests, Today's AI Requests, This Month, Previous
Month, Total Tokens, Input Tokens, Output Tokens, Estimated AI Cost, Top Organisations, Top AI
Features, Top Models, Failed Requests, Average Request Cost.

## 14. Organisation AI Usage

Each organisation must have an AI usage profile.

```
Profile Overview (ABC Trading Pvt Ltd)
Plan: PRO
Monthly AI Allocation: 100,000 credits
Used: 67,420 | Remaining: 32,580 | Usage: 67.4%

Feature Breakdown:
  AI Assistant:        21,400
  Document Processing: 12,800
  AI Automation:       18,220
  AI Reports:           9,500
  AI Agents:            5,500
```

## 15. AI Usage Limits

Global Admin should be able to configure: Monthly AI Credits, Daily AI Credits, Maximum Requests,
Maximum Token Usage, Maximum Cost.

**Notification Thresholds:** 50% → Informational · 75% → Warning · 90% → Critical Warning ·
100% → Limit Reached.

System behaviour after 100% should be configurable: `BLOCK`, `THROTTLE`, `ALLOW WITH OVERAGE`,
`ALLOW BUT LOG`.

## 16. AI Overage

Enterprise customers may be allowed to exceed their allocation.

```
Included: 100,000 credits
Used:     100,000
Overage:   18,420
Overage Cost: ₹X / 1,000 credits
```

**Global Admin Controls:** Overage enabled/disabled, Overage rate, Hard limit, Soft limit,
Alert thresholds.

## 17. AI Usage Logs

Every AI request should generate a usage record.

**Policy:** Do not store sensitive AI prompt/response content in normal operational logs by
default. If retained, it should follow explicit privacy, retention, and access-control policies.

## 18. Organisation Activity Logs

Every organisation needs an activity timeline.

**Filters:** User, Action, Module, Date, IP, Device, Severity.

## 19. Global Audit Logs

This should be separate from ordinary activity logs.

- **Activity Log answers:** "What happened?"
- **Audit Log answers:** "Who did it, from where, when, and what changed?"

## 20. Logs by Organisation Type

The platform should support organisation-type-specific logging.

- **SME:** Accounting, Sales, Purchase, Inventory, Tax, AI, Users.
- **Enterprise:** Accounting, Finance, Procurement, Inventory, HR, Payroll, Compliance, API, AI,
  Security.
- **Accountant / CA Firm:** Client Management, Client Switching, Bookkeeping, Tax, GST, Reports,
  Document Processing, AI.
- **Multi-Company Group:** Parent Organisation, Subsidiaries, Inter-company Transactions,
  Consolidation, Users, Permissions, AI.

The Global Admin log system should support:
Organisation Type → Event Categories → Event Types → Severity → Retention Policy.

## 21. Standard Event Taxonomy

Use structured event names rather than free-form text.

- **AUTH:** LOGIN, LOGOUT, LOGIN_FAILED, PASSWORD_CHANGED, MFA_ENABLED, MFA_DISABLED
- **USER:** USER_CREATED, USER_UPDATED, USER_DELETED, ROLE_CHANGED, USER_SUSPENDED
- **ORGANISATION:** ORGANISATION_CREATED, ORGANISATION_UPDATED, ORGANISATION_SUSPENDED,
  ORGANISATION_REACTIVATED, ORGANISATION_ARCHIVED
- **SUBSCRIPTION:** PLAN_ASSIGNED, PLAN_CHANGED, PLAN_UPGRADED, PLAN_DOWNGRADED, PLAN_CANCELLED
- **AI:** AI_REQUEST, AI_REQUEST_FAILED, AI_LIMIT_WARNING, AI_LIMIT_REACHED, AI_AGENT_EXECUTED,
  AI_AUTOMATION_EXECUTED
- **SECURITY:** SUSPICIOUS_LOGIN, PERMISSION_DENIED, API_KEY_CREATED, API_KEY_REVOKED,
  SECURITY_POLICY_CHANGED

## 22. Log Severity

Every event should have severity: `INFO`, `WARNING`, `ERROR`, `CRITICAL`, `SECURITY`.

## 23. Global Search

Global Admin needs one powerful search interface. Search across: Organisation, User, Organisation
ID, Invoice ID, Transaction ID, AI Usage ID, Audit Event ID, API Key, Subscription, Email.

## 24. Global Admin Dashboard

The main dashboard should provide a platform-level overview.

**Key Performance Indicators (KPIs):** Total Organisations, Active Organisations, Trial
Organisations, Suspended Organisations, Total Users, Active Users, MRR, ARR, Active Subscriptions,
Upgrades, Downgrades, AI Requests, AI Cost, AI Credits Used, Storage Used, API Usage, System
Errors, Security Alerts.

**Operational Panels:** Recent Organisations, Recent Subscription Changes, AI Usage Alerts,
Security Alerts, System Errors, Recent Global Admin Actions.

## 25. Security & Access

Global Admin should use elevated authentication.

**Security Controls:** MFA mandatory, Session timeout, IP/device monitoring, Role-based access,
Privileged action confirmation, Audit logging.

**Avoid Single Account Risks:** Avoid a single unrestricted "super admin" account.

**Recommended Roles:** `GLOBAL_SUPER_ADMIN`, `GLOBAL_ADMIN`, `BILLING_ADMIN`, `AI_ADMIN`,
`SUPPORT_ADMIN`, `SECURITY_ADMIN`, `READ_ONLY_ADMIN`.

## 26. Impersonation / Organisation Access

Global Admin may need to troubleshoot an organisation. **Do not implement this as invisible
login-as-user functionality.**

```
Global Admin → Request Organisation Access → Reason Required → Access Granted →
Restricted Session → Everything Logged → Session Ends
```

Every action performed during an elevated organisation session must identify: Original Global
Admin, Organisation Impersonated/Support Context, Session ID, Timestamp, Actions.

## 27. Data Retention & Logs

Logs should be immutable from the normal application layer.

```
Application → Event Bus → Audit Service → Immutable Audit Store → Global Admin Log Viewer
```

**Configurable Retention Periods:** 30 days, 90 days, 1 year, 3 years, 7 years, Custom.

**Retention Variables:** Organisation Type, Country, Event Type, Compliance Requirement,
Subscription.

## 28. Notifications & Alerts

Global Admin should receive alerts for important platform events.

**Alert Conditions:** Organisation exceeded AI quota, AI cost spike detected, Multiple failed
logins, Organisation suspended, Payment failure, Large subscription downgrade, Unusual API usage,
Mass data export, Repeated permission failures, System error spike.

**Supported Delivery Channels:** In-app, Email, Webhook.

## 29. API & Integration Monitoring

For organisations using APIs, Global Admin should see: API Requests, Successful Requests, Failed
Requests, Rate Limits, API Keys, Endpoints, Response Time, Errors.

## 30. Global Admin Functional Permissions

| Capability | Super Admin | Global Admin | AI Admin | Billing Admin | Read Only |
|---|---|---|---|---|---|
| View Organisations | Yes | Yes | Yes | Yes | Yes |
| Create Organisation | Yes | Yes | No | No | No |
| Suspend Organisation | Yes | Yes | No | No | No |
| Change Plan | Yes | Yes | No | Yes | No |
| Configure AI Limits | Yes | No | Yes | No | No |
| View AI Usage | Yes | Yes | Yes | Yes | Yes |
| View Audit Logs | Yes | Yes | Yes | Yes | Yes |
| Delete Organisation | Yes | No | No | No | No |
| Manage Global Admins | Yes | No | No | No | No |
| Security Configuration | Yes | No | No | No | No |

## 31. Recommended Core Data Model

At minimum, the platform should have: `organisations`, `organisation_types`,
`organisation_settings`, `plans`, `plan_features`, `organisation_subscriptions`, `users`, `roles`,
`permissions`, `user_roles`, `ai_usage`, `ai_usage_daily`, `ai_usage_monthly`, `ai_limits`,
`ai_costs`, `audit_logs`, `activity_logs`, `security_logs`, `system_logs`, `api_keys`, `api_usage`,
`admin_users`, `admin_roles`, `admin_sessions`.

**Audit Log Schema Structure**

```
audit_logs (id, tenant_id, actor_id, actor_type, actor_role, event_category, event_type,
            severity, entity_type, entity_id, old_value, new_value, ip_address, user_agent,
            session_id, metadata, created_at)
```

**Note:** For `old_value` and `new_value`, use structured JSON rather than plain text wherever
possible.

## 32. Critical Architectural Principle

Do not build Global Admin as another frontend sitting on top of normal ERP APIs. Build it as a
platform control plane.

```
                      AUPULENS PLATFORM
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
  GLOBAL CONTROL PLANE                 TENANT DATA PLANE
            │                                   │
      Organisations                       Organisation A
      Subscriptions                       Organisation B
      AI Metering                         Organisation C
      Platform Config                     Organisation D
      Security                            Organisation E
      Audit                               ...
      Monitoring
```

The Global Admin controls the environment in which tenants operate.

## 33. Non-Negotiable Developer Rules

1. Every organisation must have a unique Tenant ID.
2. Every tenant-scoped database record must be tenant-isolated.
3. Global Admin actions must always be auditable.
4. AI usage must be metered independently from the UI.
5. Subscription entitlements must be configuration-driven, not hard-coded.
6. Plan changes must never silently delete tenant data.
7. Audit logs must be append-only/immutable to ordinary application users.
8. Organisation suspension must immediately affect authentication and/or transaction access
   according to defined policy.
9. Global Admin access to tenant data must be explicitly permissioned and logged.
10. AI cost and usage calculations must be server-side and tamper-resistant.
11. Logs must contain structured event types, not only human-readable descriptions.
12. All timestamps should be stored consistently, preferably UTC, with organisation timezone
    applied at presentation.
13. Global Admin and Organisation Admin must have completely separate permission domains.
14. Sensitive prompts, financial data, credentials, and personal data should not be unnecessarily
    duplicated into logs.
15. Every privileged action should have an identifiable actor, timestamp, tenant, session, and
    outcome.

## Summary

The Global Admin provides Aupulens operators with a unified control surface across all critical
operational areas:

```
Organisations → Plans → Features → Users → AI → Usage → Billing → Security → Logs → Platform Health
```
