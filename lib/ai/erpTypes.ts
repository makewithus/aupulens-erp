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
    };
