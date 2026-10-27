/**
 * Aupulens ERP — Central AI Capability Registry
 *
 * Defines machine-readable capabilities, schemas, authoritative query/mutation services,
 * business validation rules, permission gates, and cross-module relationships for every
 * enabled module across the ERP platform.
 */

export interface ModuleEntitySchema {
  name: string;
  model: string;
  identifierField: string;
  requiredFields: string[];
  optionalFields: string[];
  statusValues?: string[];
  routes: {
    list: string;
    detail?: string;
    create?: string;
  };
}

export interface ModuleCapability {
  id: string;
  name: string;
  description: string;
  category: "operations" | "financial" | "workforce" | "crm" | "governance";
  landingRoute: string;
  readOperations: string[];
  supportedMutations: string[];
  unsupportedOperations: string[];
  confirmationRequiredActions: string[];
  authoritativeQueryServices: string[];
  authoritativeMutationServices: string[];
  entities: ModuleEntitySchema[];
  statusTransitions?: Record<string, string[]>;
  businessRules: string[];
  permissionRequirements: {
    read: string[];
    write: string[];
  };
  supportedFilters: string[];
  supportedDateRanges: string[];
  crossModuleDependencies: string[];
  verificationSteps: string[];
}

export const MODULE_CAPABILITIES: Record<string, ModuleCapability> = {
  sales: {
    id: "sales",
    name: "Sales & Invoicing",
    description: "Quotation, sales order, delivery challan, customer management, and sales invoicing lifecycle.",
    category: "operations",
    landingRoute: "/sales/dashboard",
    readOperations: [
      "query_invoices",
      "lookup_invoice_by_number",
      "count_invoices_by_status",
      "calculate_issued_revenue",
      "query_quotes",
      "lookup_quote_by_number",
      "query_sales_orders",
      "query_customers",
      "lookup_customer_by_name",
    ],
    supportedMutations: [
      "create_customer_draft",
      "update_customer_draft",
      "confirm_customer_draft",
      "cancel_customer_draft",
      "create_quote_draft",
      "update_quote_draft",
      "confirm_quote_draft",
      "cancel_quote_draft",
    ],
    unsupportedOperations: [
      "bulk_delete_invoices",
      "force_cancel_paid_invoice",
      "modify_posted_invoice_lines",
    ],
    confirmationRequiredActions: [
      "confirm_customer_draft",
      "confirm_quote_draft",
      "cancel_customer_draft",
    ],
    authoritativeQueryServices: [
      "executeErpQuery (SalesInvoice, Customer, SalesQuotation, SaleOrder)",
      "issuedInvoiceFilter",
      "unpaidInvoiceFilter",
    ],
    authoritativeMutationServices: [
      "confirmCustomerDraft (Customer.create)",
      "confirmQuoteDraft (SalesQuotation.create)",
    ],
    entities: [
      {
        name: "Customer",
        model: "Customer",
        identifierField: "header.name",
        requiredFields: ["name", "isCompany"],
        optionalFields: ["phone", "email", "gstin", "pan", "currency"],
        routes: { list: "/sales/customers", create: "/sales/customers/new" },
      },
      {
        name: "SalesInvoice",
        model: "SalesInvoice",
        identifierField: "number",
        requiredFields: ["customerId", "lines", "invoiceDate", "dueDate"],
        optionalFields: ["reference", "notes", "tax"],
        statusValues: ["draft", "issued", "paid", "partially_paid", "overdue", "cancelled"],
        routes: { list: "/sales/invoices", detail: "/sales/invoices/:id", create: "/sales/invoices/new" },
      },
      {
        name: "SalesQuotation",
        model: "SalesQuotation",
        identifierField: "quoteNumber",
        requiredFields: ["customerId", "lines", "quoteDate"],
        optionalFields: ["reference", "expiryDate", "notes", "terms"],
        statusValues: ["draft", "sent", "accepted", "declined", "converted", "cancelled"],
        routes: { list: "/sales/quotes", detail: "/sales/quotes/:id", create: "/sales/quotes/new" },
      },
      {
        name: "SaleOrder",
        model: "SaleOrder",
        identifierField: "header.name",
        requiredFields: ["customerId", "lines"],
        optionalFields: ["header.dateOrder", "expectedShipmentDate", "paymentTerms"],
        statusValues: ["draft", "confirmed", "in_production", "shipped", "completed", "cancelled"],
        routes: { list: "/sales/orders", detail: "/sales/orders/:id", create: "/sales/orders/new" },
      },
    ],
    statusTransitions: {
      SalesInvoice: ["draft -> issued", "issued -> partially_paid", "partially_paid -> paid", "issued -> paid", "draft -> cancelled", "issued -> cancelled"],
      SalesQuotation: ["draft -> sent", "sent -> accepted", "sent -> declined", "accepted -> converted", "draft -> cancelled"],
    },
    businessRules: [
      "Issued invoice revenue excludes drafts, cancellations, and credit notes.",
      "Customer drafts require explicit name and individual vs business type before save.",
      "Phone numbers must follow valid phone formatting and not be treated as empty strings.",
      "Double confirmation or concurrent submissions must be prevented via transactional locking.",
    ],
    permissionRequirements: {
      read: ["sales", "admin", "master-admin"],
      write: ["sales", "admin", "master-admin"],
    },
    supportedFilters: ["status", "dateFrom", "dateTo", "customer", "amountMin", "amountMax"],
    supportedDateRanges: ["last_30_days", "this_month", "last_month", "custom_iso_range"],
    crossModuleDependencies: [
      "Finance (JournalEntry postings for recognized revenue)",
      "Inventory (Stock delivery deductions for shipped orders)",
      "CRM (Opportunity conversion to Quotes)",
    ],
    verificationSteps: [
      "Execute authoritative query against MongoDB collection following write.",
      "Assert persisted document ID and field integrity.",
      "Verify returned status code 201/200 and audit trail entry.",
    ],
  },

  inventory: {
    id: "inventory",
    name: "Inventory & Warehouses",
    description: "Product catalog, warehouse stock balances, movements, goods receipts, and deliveries.",
    category: "operations",
    landingRoute: "/inventory/dashboard",
    readOperations: [
      "query_products",
      "lookup_product_by_code",
      "query_warehouses",
      "query_stock_movements",
      "calculate_stock_aging",
    ],
    supportedMutations: [
      "create_product_draft",
      "record_stock_movement",
    ],
    unsupportedOperations: [
      "override_stock_without_audit_log",
      "negative_inventory_on_strict_warehouses",
    ],
    confirmationRequiredActions: [
      "record_stock_movement",
      "create_product_draft",
    ],
    authoritativeQueryServices: [
      "Product.find / Product.countDocuments",
      "Warehouse.find",
      "StockMovement.find",
    ],
    authoritativeMutationServices: [
      "Product.create",
      "StockMovement.create",
    ],
    entities: [
      {
        name: "Product",
        model: "Product",
        identifierField: "tab_general_information.default_code",
        requiredFields: ["header.name", "tab_general_information.list_price"],
        optionalFields: ["tab_general_information.cost_price", "description", "category"],
        routes: { list: "/inventory/products", detail: "/inventory/products/:id" },
      },
      {
        name: "Warehouse",
        model: "Warehouse",
        identifierField: "code",
        requiredFields: ["name", "code", "type"],
        optionalFields: ["address", "capacity", "managerName"],
        routes: { list: "/inventory/warehouses", detail: "/inventory/warehouses/:id" },
      },
    ],
    businessRules: [
      "Stock movements require valid source and destination references.",
      "Inventory valuation uses FIFO / weighted average cost principles.",
    ],
    permissionRequirements: {
      read: ["inventory", "sales", "manufacturing", "admin", "master-admin"],
      write: ["inventory", "admin", "master-admin"],
    },
    supportedFilters: ["category", "warehouse", "stockLevel", "search"],
    supportedDateRanges: ["all", "last_7_days", "last_30_days", "this_month"],
    crossModuleDependencies: [
      "Sales (Product catalog and line item availability)",
      "Manufacturing (Raw material staging and finished goods receipt)",
      "Purchases (Inbound receipts from vendors)",
    ],
    verificationSteps: [
      "Read back updated stock level from Product / Warehouse records.",
      "Check ledger movement logging.",
    ],
  },

  finance: {
    id: "finance",
    name: "Finance & Accounting",
    description: "General ledger, posted journal entries, chart of accounts, and profit & loss analytics.",
    category: "financial",
    landingRoute: "/finance/summary",
    readOperations: [
      "build_profit_loss_report",
      "query_journal_entries",
      "query_chart_of_accounts",
      "verify_trial_balance",
    ],
    supportedMutations: [
      "post_journal_entry",
      "reconcile_posted_entries",
    ],
    unsupportedOperations: [
      "delete_posted_journal_entry",
      "alter_historical_balanced_period",
    ],
    confirmationRequiredActions: [
      "post_journal_entry",
    ],
    authoritativeQueryServices: [
      "buildPostedJournalReport",
      "JournalEntry.find",
      "Account.find",
    ],
    authoritativeMutationServices: [
      "JournalEntry.create",
    ],
    entities: [
      {
        name: "JournalEntry",
        model: "JournalEntry",
        identifierField: "entryNumber",
        requiredFields: ["header.date", "lines", "status"],
        optionalFields: ["header.reference", "header.narration"],
        statusValues: ["draft", "posted", "cancelled"],
        routes: { list: "/finance/journal-entries", detail: "/finance/journal-entries/:id" },
      },
      {
        name: "Account",
        model: "Account",
        identifierField: "code",
        requiredFields: ["name", "code", "accountType"],
        optionalFields: ["parentAccountId", "currency"],
        routes: { list: "/finance/chart-of-accounts" },
      },
    ],
    businessRules: [
      "Financial P&L must be calculated strictly from authoritative posted journal entries.",
      "Sales invoices not yet posted as journals are reported with an integrity notice and not substituted for net profit.",
      "Total debits must equal total credits for any posted journal entry.",
      "Separated COGS accounts must be distinguished from operating expenses.",
    ],
    permissionRequirements: {
      read: ["finance", "admin", "master-admin"],
      write: ["finance", "admin", "master-admin"],
    },
    supportedFilters: ["period", "accountType", "basis", "dateFrom", "dateTo"],
    supportedDateRanges: ["month", "quarter", "year", "all_time", "custom_iso_range"],
    crossModuleDependencies: [
      "Sales (Invoice recognition)",
      "HR (Payroll expense postings)",
      "Purchases (Vendor bill disbursements)",
    ],
    verificationSteps: [
      "Check trial balance equilibrium (debits == credits).",
      "Verify posted journal count and net profit calculation formula.",
    ],
  },

  hr: {
    id: "hr",
    name: "HR & Workforce",
    description: "Employee records, department structure, attendance, leave management, and headcount analytics.",
    category: "workforce",
    landingRoute: "/hr/dashboard",
    readOperations: [
      "query_employee_directory",
      "count_employees_total",
      "count_employees_active",
      "count_employees_linked_to_users",
      "count_employees_unlinked",
      "count_employees_by_department",
      "lookup_employee_by_name_or_code",
      "query_department_headcounts",
      "export_hr_analytics_tabular",
    ],
    supportedMutations: [
      "create_employee",
      "update_employee",
      "reassign_employee_department",
      "change_user_role",
    ],
    unsupportedOperations: [
      "hard_delete_active_employee_with_payroll_history",
      "expose_confidential_bank_or_salary_details_in_public_chat",
    ],
    confirmationRequiredActions: [
      "change_user_role",
      "create_employee",
    ],
    authoritativeQueryServices: [
      "Employee.countDocuments",
      "Employee.find",
      "Department.find",
      "Department.countDocuments",
    ],
    authoritativeMutationServices: [
      "Employee.create",
      "COMMAND_ACTIONS.update_user_role.execute",
    ],
    entities: [
      {
        name: "Employee",
        model: "Employee",
        identifierField: "employeeCode",
        requiredFields: ["firstName", "lastName", "email", "phone"],
        optionalFields: ["departmentId", "designation", "dateOfJoining", "employmentType", "userId"],
        statusValues: ["candidate", "onboarding", "active", "on_notice", "exit_initiated", "clearance", "exited"],
        routes: { list: "/hr/employees", detail: "/hr/employees/:id", create: "/hr/employees/new" },
      },
      {
        name: "Department",
        model: "Department",
        identifierField: "code",
        requiredFields: ["name", "code"],
        optionalFields: ["description", "headOfDepartment"],
        routes: { list: "/hr/departments" },
      },
    ],
    businessRules: [
      "Total employee counts include all non-exited employees, reconciling with directory filters.",
      "Active employee count strictly matches lifecycleStatus == 'active'.",
      "Questions about employees must query Employee collection, never invoice records.",
      "Date filters on employee directory must use UTC midnight-to-end-of-day boundaries.",
      "Exports must be structured, multidimensional, and protected against CSV formula injection.",
    ],
    permissionRequirements: {
      read: ["hr", "admin", "master-admin", "manager", "user"],
      write: ["hr", "admin", "master-admin"],
    },
    supportedFilters: ["lifecycle", "department", "accountLinked", "dateFrom", "dateTo", "search"],
    supportedDateRanges: ["30D", "90D", "1Y", "custom_date_range"],
    crossModuleDependencies: [
      "Admin (User account linking and role synchronization)",
      "Finance (Payroll expense allocation by cost center)",
    ],
    verificationSteps: [
      "Read back persisted Employee document from MongoDB by ID.",
      "Re-evaluate department aggregation to verify updated slice in chart.",
    ],
  },

  crm: {
    id: "crm",
    name: "CRM & Pipelines",
    description: "Leads, customer accounts, contacts, opportunities, and sales deal pipelines.",
    category: "crm",
    landingRoute: "/crm/dashboard",
    readOperations: [
      "query_leads",
      "query_accounts",
      "query_opportunities",
      "calculate_pipeline_value",
    ],
    supportedMutations: [
      "create_lead",
      "convert_lead_to_opportunity",
      "update_opportunity_stage",
    ],
    unsupportedOperations: [
      "bypass_opportunity_close_reason_validation",
    ],
    confirmationRequiredActions: [
      "convert_lead_to_opportunity",
    ],
    authoritativeQueryServices: [
      "Lead.find",
      "Account.find",
      "Opportunity.find",
    ],
    authoritativeMutationServices: [
      "Lead.create",
      "Opportunity.create",
    ],
    entities: [
      {
        name: "Lead",
        model: "Lead",
        identifierField: "name",
        requiredFields: ["name"],
        optionalFields: ["company", "email", "phone", "priority", "source"],
        routes: { list: "/crm/leads", detail: "/crm/leads/:id" },
      },
      {
        name: "Opportunity",
        model: "Opportunity",
        identifierField: "name",
        requiredFields: ["name", "accountId", "amount", "expectedCloseDate"],
        optionalFields: ["stage", "probability", "forecastCategory"],
        routes: { list: "/crm/opportunities", detail: "/crm/opportunities/:id" },
      },
    ],
    businessRules: [
      "Opportunities require linked Accounts and expected close dates.",
      "Pipeline value is calculated from open opportunities weighted by stage probability.",
    ],
    permissionRequirements: {
      read: ["crm", "sales", "admin", "master-admin"],
      write: ["crm", "sales", "admin", "master-admin"],
    },
    supportedFilters: ["stage", "priority", "source", "owner"],
    supportedDateRanges: ["this_month", "this_quarter", "this_year"],
    crossModuleDependencies: [
      "Sales (Opportunity converted into Quotes & Orders)",
    ],
    verificationSteps: [
      "Verify lead status updated to converted with linked opportunity reference.",
    ],
  },

  manufacturing: {
    id: "manufacturing",
    name: "Manufacturing & Production",
    description: "Work orders, bills of materials (BOM), production tracking, and QC inspections.",
    category: "operations",
    landingRoute: "/manufacturing/dashboard",
    readOperations: [
      "query_work_orders",
      "query_qc_inspection_yields",
      "calculate_production_completion_rate",
    ],
    supportedMutations: [
      "create_work_order",
      "record_qc_inspection",
    ],
    unsupportedOperations: [
      "fabricate_synthetic_chart_multipliers",
    ],
    confirmationRequiredActions: [
      "record_qc_inspection",
    ],
    authoritativeQueryServices: [
      "WorkOrder.find",
      "QualityCheck.find",
    ],
    authoritativeMutationServices: [
      "WorkOrder.create",
    ],
    entities: [
      {
        name: "WorkOrder",
        model: "WorkOrder",
        identifierField: "orderNumber",
        requiredFields: ["productId", "quantityToProduce"],
        optionalFields: ["scheduledStartDate", "assignedOperatorId"],
        statusValues: ["draft", "staged", "in_production", "inspection", "completed", "cancelled"],
        routes: { list: "/manufacturing/work-orders", detail: "/manufacturing/work-orders/:id" },
      },
    ],
    businessRules: [
      "QC Yield & Defect analytics must reflect real inspection outcomes (Passed, Pending, Rejected).",
      "Synthetic multipliers (e.g. qty * 50) and placeholder chart points are forbidden.",
      "Work order status categories are mutually exclusive.",
    ],
    permissionRequirements: {
      read: ["manufacturing", "inventory", "admin", "master-admin"],
      write: ["manufacturing", "admin", "master-admin"],
    },
    supportedFilters: ["status", "product", "priority", "dateRange"],
    supportedDateRanges: ["last_30_days", "this_month", "custom_iso_range"],
    crossModuleDependencies: [
      "Inventory (Raw material component consumption)",
    ],
    verificationSteps: [
      "Confirm work order state transition and check stock deduction logs.",
    ],
  },

  purchases: {
    id: "purchases",
    name: "Purchases & Suppliers",
    description: "Vendor directory, purchase orders, vendor bills, and supplier receipt verification.",
    category: "operations",
    landingRoute: "/finance/bills",
    readOperations: [
      "query_purchase_orders",
      "query_suppliers",
      "calculate_procurement_spend",
    ],
    supportedMutations: [
      "create_purchase_order_draft",
    ],
    unsupportedOperations: [
      "pay_vendor_bill_without_receipt_matching",
    ],
    confirmationRequiredActions: [
      "create_purchase_order_draft",
    ],
    authoritativeQueryServices: [
      "PurchaseOrder.find",
      "Supplier.find",
    ],
    authoritativeMutationServices: [
      "PurchaseOrder.create",
    ],
    entities: [
      {
        name: "PurchaseOrder",
        model: "PurchaseOrder",
        identifierField: "orderNumber",
        requiredFields: ["supplierId", "lines", "orderDate"],
        optionalFields: ["expectedDeliveryDate", "paymentTerms"],
        routes: { list: "/purchases/orders", detail: "/purchases/orders/:id" },
      },
    ],
    businessRules: [
      "Purchase orders require registered supplier and valid line items.",
    ],
    permissionRequirements: {
      read: ["purchases", "finance", "admin", "master-admin"],
      write: ["purchases", "admin", "master-admin"],
    },
    supportedFilters: ["status", "supplier", "dateFrom", "dateTo"],
    supportedDateRanges: ["this_month", "last_quarter", "all_time"],
    crossModuleDependencies: [
      "Inventory (Goods Receipt Note matching)",
      "Finance (Accounts Payable ledger postings)",
    ],
    verificationSteps: [
      "Verify PO persisted in purchase records.",
    ],
  },

  projects: {
    id: "projects",
    name: "Projects & Tasks",
    description: "Project management, milestones, sprint boards, task assignments, and time logs.",
    category: "operations",
    landingRoute: "/projects/dashboard",
    readOperations: [
      "query_projects",
      "query_tasks",
      "calculate_project_progress",
    ],
    supportedMutations: [
      "create_project",
      "update_task_status",
    ],
    unsupportedOperations: [
      "delete_project_with_billed_time_entries",
    ],
    confirmationRequiredActions: [
      "create_project",
    ],
    authoritativeQueryServices: [
      "Project.find",
      "Task.find",
    ],
    authoritativeMutationServices: [
      "Project.create",
    ],
    entities: [
      {
        name: "Project",
        model: "Project",
        identifierField: "name",
        requiredFields: ["name", "status"],
        optionalFields: ["description", "priority", "dueDate", "client"],
        statusValues: ["planning", "active", "on_hold", "completed", "archived"],
        routes: { list: "/projects/dashboard", detail: "/projects/:id" },
      },
    ],
    businessRules: [
      "Navigation to Projects must reliably route to /projects/dashboard.",
    ],
    permissionRequirements: {
      read: ["project", "admin", "master-admin", "user"],
      write: ["project", "admin", "master-admin"],
    },
    supportedFilters: ["status", "priority", "assignee"],
    supportedDateRanges: ["active_sprint", "this_month", "all"],
    crossModuleDependencies: [
      "HR (Task assignee references)",
      "Sales (Client project linking)",
    ],
    verificationSteps: [
      "Read back project document and check task lists.",
    ],
  },

  admin: {
    id: "admin",
    name: "Admin & Organization",
    description: "Tenant configuration, user authentication, role assignments, audit logs, and security.",
    category: "governance",
    landingRoute: "/admin/dashboard",
    readOperations: [
      "query_organization_info",
      "query_users",
      "lookup_user_by_email_or_name",
      "query_audit_logs",
    ],
    supportedMutations: [
      "update_user_role",
      "toggle_user_status",
    ],
    unsupportedOperations: [
      "bypass_admin_role_change_verification",
      "delete_tenant_root_admin",
    ],
    confirmationRequiredActions: [
      "update_user_role",
      "toggle_user_status",
    ],
    authoritativeQueryServices: [
      "Organization.findOne",
      "User.find",
      "User.findOne",
    ],
    authoritativeMutationServices: [
      "COMMAND_ACTIONS.update_user_role.execute",
    ],
    entities: [
      {
        name: "User",
        model: "User",
        identifierField: "email",
        requiredFields: ["name", "email", "role"],
        optionalFields: ["phone", "userRole", "department", "employeeId"],
        statusValues: ["active", "inactive", "archived", "deleted"],
        routes: { list: "/admin/users", detail: "/admin/users/:id" },
      },
      {
        name: "Organization",
        model: "Organization",
        identifierField: "subdomain",
        requiredFields: ["name", "subdomain"],
        optionalFields: ["tier", "subscriptionStatus"],
        routes: { list: "/admin/settings" },
      },
    ],
    businessRules: [
      "Role changes require administrator permissions and explicit user confirmation.",
      "Role changes must verify persisted records in MongoDB before reporting success.",
    ],
    permissionRequirements: {
      read: ["admin", "master-admin"],
      write: ["admin", "master-admin"],
    },
    supportedFilters: ["role", "status", "search"],
    supportedDateRanges: ["all_time"],
    crossModuleDependencies: [
      "HR (Employee user account synchronization)",
    ],
    verificationSteps: [
      "Query User and Employee models by updated ID and assert new role value.",
    ],
  },

  subscriptions: {
    id: "subscriptions",
    name: "Subscriptions & Entitlements",
    description: "Plan tiers, AI usage credits, feature flags, and module entitlement resolution.",
    category: "governance",
    landingRoute: "/admin/billing",
    readOperations: [
      "query_active_plan",
      "check_module_entitlement",
      "query_ai_credit_balance",
    ],
    supportedMutations: [
      "upgrade_plan_tier",
    ],
    unsupportedOperations: [
      "bypass_subscription_gate_without_active_status",
    ],
    confirmationRequiredActions: [
      "upgrade_plan_tier",
    ],
    authoritativeQueryServices: [
      "resolveEntitlements",
      "Organization.findOne",
    ],
    authoritativeMutationServices: [
      "Organization.updateOne",
    ],
    entities: [
      {
        name: "OrganizationEntitlement",
        model: "OrganizationEntitlement",
        identifierField: "tenantId",
        requiredFields: ["tenantId", "planKey"],
        optionalFields: ["modules", "limits", "featureFlags"],
        routes: { list: "/admin/billing" },
      },
    ],
    businessRules: [
      "Plan details require administrative permissions.",
      "Access checks mirror middleware gate rules.",
    ],
    permissionRequirements: {
      read: ["admin", "master-admin"],
      write: ["master-admin"],
    },
    supportedFilters: ["planKey"],
    supportedDateRanges: ["current_billing_cycle"],
    crossModuleDependencies: [
      "All modules (Module access gating based on subscription tier)",
    ],
    verificationSteps: [
      "Query resolveEntitlements and verify module list.",
    ],
  },
};

/**
 * Retrieve capability descriptor for a specific module
 */
export function getModuleCapability(moduleId: string): ModuleCapability | undefined {
  return MODULE_CAPABILITIES[moduleId.toLowerCase()];
}

/**
 * Return all registered module capabilities
 */
export function getAllModuleCapabilities(): ModuleCapability[] {
  return Object.values(MODULE_CAPABILITIES);
}

/**
 * Check if a specific operation is supported within a module
 */
export function isOperationSupported(moduleId: string, operationName: string): boolean {
  const cap = getModuleCapability(moduleId);
  if (!cap) return false;
  return cap.readOperations.includes(operationName) || cap.supportedMutations.includes(operationName);
}

/**
 * Check if an action requires explicit human-in-the-loop confirmation before execution
 */
export function isActionConfirmationRequired(actionType: string): boolean {
  for (const cap of Object.values(MODULE_CAPABILITIES)) {
    if (cap.confirmationRequiredActions.includes(actionType)) {
      return true;
    }
  }
  return false;
}
