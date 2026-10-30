/**
 * Strongly-typed structured response models for Aupulens ERP AI Assistant.
 * Used for authoritative server-side results and rich, accessible client rendering.
 */

export interface ErpRecordItem {
  id?: string;
  number?: string;
  customerName?: string;
  amount?: number;
  formattedAmount?: string;
  status?: string;
  date?: string; // Formatted DD/MM/YYYY
  rawDate?: string;
  route?: string;
  extra?: Record<string, string>;
}

export interface ErpFinancialTotalSummary {
  label: string;
  amount: number;
  formattedAmount: string;
  count: number;
}

export type ErpStructuredResponse =
  | {
      type: "count";
      entity: string;
      status?: string;
      count: number;
      label?: string;
      scope?: string;
      department?: string;
    }
  | {
      type: "record_list";
      entity: string;
      title?: string;
      records: ErpRecordItem[];
      total?: ErpFinancialTotalSummary;
      offset?: number;
      totalCount?: number;
    }
  | {
      type: "financial_total";
      label: string;
      amount: number;
      formattedAmount: string;
      count?: number;
      period?: { from?: string; to?: string };
      groups?: Array<{ name: string; amount: number; formattedAmount: string; count: number }>;
      notes?: string;
    }
  | {
      type: "overdue_invoice_summary";
      count: number;
      amount: number;
    }
  | {
      type: "customer_receivables_summary";
      customerName: string;
      customerId: string;
      totalRevenue: number;
      totalInvoiced: number;
      totalPaid: number;
      totalOutstanding: number;
      invoices: Array<{
        number: string;
        totalAmount: number;
        taxableAmount?: number;
        paid: number;
        outstanding: number;
        status: string;
      }>;
    }
  | {
      type: "receivables_portfolio_summary";
      totalRevenue: number;
      totalInvoiced: number;
      totalPaid: number;
      totalOutstanding: number;
      invoiceCount: number;
    }
  | {
      type: "safety_refusal";
      title: string;
      message: string;
      recordCount?: number;
      entity?: string;
      policy?: string;
    }
  | {
      type: "quote_proposal";
      proposalId: string;
      customer: string;
      item: string;
      quantity: number;
      unit?: string;
      unitPrice: number;
      formattedUnitPrice: string;
      subtotal: number;
      formattedSubtotal: string;
      discount: number;
      formattedDiscount: string;
      tax: number;
      formattedTax: string;
      total: number;
      formattedTotal: string;
      status: "proposed";
    }
  | {
      type: "quote_saved";
      quoteNumber: string;
      status: string;
      total: number;
      formattedTotal: string;
      route?: string;
    }
  | {
      type: "plan_info";
      plan: string;
      status?: string;
      modules?: string[];
      limits?: string;
      source?: string;
    }
  | {
      type: "not_found";
      identifier?: string;
      message: string;
    }
  | {
      type: "profit_loss";
      title?: string;
      revenue: number;
      formattedRevenue: string;
      expenses: number;
      formattedExpenses: string;
      cogs?: number | null;
      formattedCogs?: string | null;
      cogsTreatment?: "separated" | "component_of_expenses" | "included_in_expenses" | "unavailable";
      cogsExplanation?: string;
      operatingExpenses?: number;
      formattedOperatingExpenses?: string;
      netProfit: number;
      formattedNetProfit: string;
      isProfitable: boolean;
      status: "profitable" | "loss" | "break_even" | "incomplete_data" | "unavailable";
      period?: { from?: string; to?: string; label?: string; type?: string; startDate?: string | Date; endDate?: string | Date };
      basis: string;
      limitations?: string;
      invoiceCount?: number;
      postedEntryCount?: number;
      details?: {
        incomeAccounts?: Array<{ code: string; name: string; amount: number; formattedAmount: string; entryCount?: number }>;
        expenseAccounts?: Array<{ code: string; name: string; amount: number; formattedAmount: string; isCogs?: boolean; entryCount?: number }>;
        unpostedCount?: number;
        trialBalanceBalanced?: boolean;
        revenueBreakdown?: Array<{ accountCode: string; accountName: string; amount: number; formattedAmount: string; entryCount?: number }>;
        cogsBreakdown?: Array<{ accountCode: string; accountName: string; amount: number; formattedAmount: string; entryCount?: number }>;
        expenseBreakdown?: Array<{ accountCode: string; accountName: string; amount: number; formattedAmount: string; entryCount?: number }>;
        crossModuleCoverage?: {
          sourcesChecked: string[];
          notes: string[];
        };
        supportingJournalEntries?: Array<{
          id: string;
          name: string;
          ref: string;
          date: string;
          voucherType: string;
          amountTotal: number;
          formattedAmount: string;
        }>;
      };
      generatedAt?: string;
    }
  | {
      type: "customer_proposal";
      proposalId: string;
      name?: string;
      isCompany?: boolean;
      email?: string;
      phone?: string;
      missingFields?: string[];
      status: "draft" | "proposed" | "confirmed";
    }
  | {
      type: "customer_saved";
      customerId?: string;
      name: string;
      isCompany: boolean;
      route: string;
    }
  | {
      type: "role_change_proposal";
      proposalId: string;
      userId?: string;
      employeeId?: string;
      employeeCode?: string;
      department?: string;
      userName: string;
      userEmail?: string;
      currentRole: string;
      currentRoleLabel: string;
      proposedRole: string;
      proposedRoleLabel: string;
      status: "proposed";
    }
  | {
      type: "role_changed";
      userId?: string;
      employeeId?: string;
      employeeCode?: string;
      department?: string;
      userName: string;
      newRole: string;
      newRoleLabel: string;
    }
  | {
      type: "clarification";
      question: string;
      contextEntity?: string;
      options?: string[];
    }
  | {
      type: "ar_reconciliation";
      title: string;
      reconciliationDate: string;
      glControlAccount: {
        id: string;
        code: string;
        name: string;
        balance: number;
        formattedBalance: string;
      };
      subledger: {
        openRecordCount?: number;
        openInvoicesCount?: number;
        balance?: number;
        subledgerBalance?: number;
        formattedBalance?: string;
        formattedSubledgerBalance?: string;
      };
      difference?: number;
      formattedDifference?: string;
      isReconciled?: boolean;
      status?: string;
      reconciliationOutcome?: {
        difference: number;
        formattedDifference: string;
        isReconciled: boolean;
        status: string;
      };
    }
  | {
      type: "missing_accounting_records";
      title: string;
      draftVendorBillsCount: number;
      unpostedPayrollsCount: number;
      unpostedJournalEntriesCount: number;
      accountsMissingCodeCount: number;
      isComplete: boolean;
      recommendation: string;
    }
  | {
      type: "unposted_journal_entries";
      title: string;
      totalCount: number;
      items: Array<{
        id: string;
        name: string;
        ref: string;
        date: string;
        status: string;
        voucherStatus: string;
        amountTotal: number;
        formattedAmount: string;
      }>;
      closeImpact: string;
    }
  | {
      type: "period_comparison";
      title: string;
      currentPeriod: { label: string; revenue: number; expenses: number; netIncome: number };
      priorPeriod: { label: string; revenue: number; expenses: number; netIncome: number };
      variances: { revenueDiff: number; expensesDiff: number; netIncomeDiff: number };
    }
  | {
      type: "close_readiness_blockers";
      title: string;
      isReady: boolean;
      blockersCount: number;
      blockers: Array<{ severity: string; title: string; description: string }>;
      trialBalanceBalanced: boolean;
    };
