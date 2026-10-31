"use client";

import React from "react";
import Link from "next/link";
import {
  Users,
  FileText,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Receipt,
  Package,
  Calendar,
  Check,
  X,
  CreditCard,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  UserCheck,
  ShieldCheck,
  UserPlus,
  Clock,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ErpStructuredResponse, ErpRecordItem } from "@/lib/ai/erpTypes";

function formatPeriodDate(val?: string): string {
  if (!val || val === "now") return "now";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
  } catch {
    return val;
  }
}

interface StructuredErpViewProps {
  data: ErpStructuredResponse;
  fallbackText?: string;
  onAction?: (actionText: string) => void;
  className?: string;
  isDark?: boolean;
}

export function formatStatusLabel(status?: string): string {
  if (!status) return "Active";
  const s = status.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getStatusBadgeClass(status?: string): string {
  const s = (status || "").toLowerCase();
  if (s === "paid" || s === "confirmed" || s === "posted" || s === "approved" || s === "active") {
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  }
  if (s === "overdue" || s === "cancelled" || s === "rejected" || s === "failed") {
    return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  }
  if (s === "partially_paid" || s === "partial" || s === "pending") {
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  }
  // Saved / draft / default
  return "bg-slate-500/10 text-slate-400 border-slate-500/20";
}

import { useRouter } from "next/navigation";
import { useAiChatStore } from "@/store/aiChatStore";

export function StructuredErpView({ data, onAction, className, fallbackText }: StructuredErpViewProps) {
  let router: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    router = useRouter();
  } catch {
    router = null;
  }

  const handleNavigate = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    if (router?.push) {
      router.push(href);
    } else if (typeof window !== "undefined") {
      window.location.href = href;
    }
    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      useAiChatStore.getState().close();
    }
  };

  switch (data.type) {
    case "count": {
      const getIcon = () => {
        const e = data.entity.toLowerCase();
        if (e.includes("customer")) return <Users className="w-4 h-4 text-primary" />;
        if (e.includes("invoice")) return <Receipt className="w-4 h-4 text-primary" />;
        if (e.includes("product")) return <Package className="w-4 h-4 text-primary" />;
        return <FileText className="w-4 h-4 text-primary" />;
      };

      return (
        <div className={cn("p-4 rounded-xl border border-border/70 bg-card/70 backdrop-blur-sm shadow-sm space-y-2", className)}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {getIcon()}
            <span>{data.label || `Total ${data.entity}`}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold tracking-tight text-foreground">
              {data.count.toLocaleString("en-IN")}
            </span>
            <span className="text-xs text-muted-foreground">records</span>
          </div>
          <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Authoritative count from ERP database</span>
          </p>
        </div>
      );
    }

    case "record_list": {
      const displayedRecords = data.records.slice(0, 5);
      const totalAvailable = data.totalCount !== undefined ? data.totalCount : data.records.length;
      const hasMore = data.records.length > 5 || (data.totalCount !== undefined && data.totalCount > data.records.length);
      const entityRoute = data.entity === "invoice"
        ? "/sales/invoices"
        : data.entity === "quote"
        ? "/sales/quotes"
        : data.entity === "sales_order"
        ? "/sales/orders"
        : data.entity === "product"
        ? "/sales/products"
        : data.entity === "employee"
        ? "/hr/employees"
        : "/sales/customers";

      const targetCustomer = (data as any).customerName || displayedRecords[0]?.customerName;
      let finalEntityRoute = entityRoute;
      if (targetCustomer && targetCustomer !== "Customer unavailable") {
        finalEntityRoute = `${entityRoute}?search=${encodeURIComponent(targetCustomer)}`;
      }

      return (
        <div className={cn("space-y-3", className)}>
          {data.title && (
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
              <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                {data.title}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                Showing {displayedRecords.length} of {totalAvailable}
              </span>
            </div>
          )}

          <div className="space-y-2">
            {displayedRecords.map((rec: ErpRecordItem, idx: number) => {
              const docNum = rec.number || `Record #${idx + 1}`;
              const docLink = rec.route ? (
                <a
                  href={rec.route}
                  onClick={(e) => handleNavigate(e, rec.route!)}
                  className="group inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  <span>{docNum}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                </a>
              ) : (
                <span className="font-mono text-xs font-semibold text-foreground">{docNum}</span>
              );

              return (
                <div
                  key={rec.id || idx}
                  className="p-3 rounded-lg border border-border/70 bg-card/60 hover:bg-card/90 transition-colors shadow-xs space-y-1.5 text-xs"
                >
                  {/* Top row: Document link + Status badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-muted-foreground text-[11px]">{data.entity === "invoice" ? "Invoice" : data.entity === "quote" ? "Quote" : data.entity === "employee" ? "Employee ID" : "Document"}:</span>
                      {docLink}
                    </div>
                    {rec.status && (
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wider", getStatusBadgeClass(rec.status))}>
                        {formatStatusLabel(rec.status)}
                      </span>
                    )}
                  </div>

                  {/* Customer row */}
                  {rec.customerName && (
                    <div className="text-[11.5px] truncate">
                      <span className="text-muted-foreground">{data.entity === "employee" ? "Employee Name: " : "Customer: "}</span>
                      <span className="font-medium text-foreground">{rec.customerName}</span>
                    </div>
                  )}

                  {/* Amount and Date row */}
                  {(rec.amount !== undefined || rec.formattedAmount || rec.date) && (
                    <div className="flex items-center justify-between text-[11.5px] pt-1 border-t border-border/30">
                      {data.entity !== "employee" ? (
                        <div>
                          <span className="text-muted-foreground">Amount: </span>
                          <span className="font-mono font-bold text-foreground">
                            {rec.formattedAmount || (rec.amount !== undefined ? `₹${rec.amount.toLocaleString("en-IN")}` : "—")}
                          </span>
                        </div>
                      ) : (
                        <div />
                      )}
                      {rec.date && (
                        <div className="text-muted-foreground flex items-center gap-1 font-mono text-[11px]">
                          <Calendar className="w-3 h-3 opacity-70" />
                          <span>{data.entity === "employee" ? `Joined: ${rec.date}` : rec.date}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Optional extra metadata */}
                  {rec.extra && Object.keys(rec.extra).length > 0 && (
                    <div className="text-[11px] text-muted-foreground pt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {Object.entries(rec.extra).map(([k, v]) => (
                        <span key={k}>
                          <span className="capitalize">{k}: </span>
                          <span className="text-foreground">{v}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Show all link if list exceeds compact view */}
          {hasMore && (
            <div className="pt-1.5 text-center">
              <a
                href={finalEntityRoute}
                onClick={(e) => handleNavigate(e, finalEntityRoute)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-lg border border-primary/25 bg-primary/10 hover:bg-primary/20 cursor-pointer"
              >
                <span>View all {totalAvailable} {data.entity.replaceAll("_", " ")} records in {data.entity === "employee" ? "HR" : "Sales"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Financial summary total box */}
          {data.total && (
            <div className="mt-3 p-3.5 rounded-lg border border-border/80 bg-muted/30 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {data.total.label}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {data.total.count} {data.total.count === 1 ? "invoice" : "invoices"}
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono text-lg md:text-xl font-bold tracking-tight text-emerald-400">
                  {data.total.formattedAmount}
                </span>
              </div>
            </div>
          )}
        </div>
      );
    }

    case "financial_total": {
      const isRevenue = data.label.toLowerCase().includes("issued") || data.label.toLowerCase().includes("revenue");
      return (
        <div className={cn("p-4 rounded-xl border border-border/70 bg-card/70 backdrop-blur-sm shadow-sm space-y-2.5", className)}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {data.label}
            </div>
            {data.amount >= 100000 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                About ₹{(data.amount / 100000).toFixed(1)} lakh
              </span>
              )}
          </div>
          <div className="font-mono text-2xl md:text-3xl font-extrabold tracking-tight text-emerald-400">
            {data.formattedAmount}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5 border-t border-border/40">
            {data.count !== undefined && (
              <span>Across {data.count} {data.count === 1 ? "record" : "records"}</span>
            )}
            {data.period && (
              <span>· Period: {formatPeriodDate(data.period.from)} to {formatPeriodDate(data.period.to)}</span>
            )}
            {isRevenue && (
              <span className="text-emerald-400/90 font-medium">· Drafts excluded</span>
            )}
          </div>
          {data.notes && (
            <p className="text-[11px] text-muted-foreground/90 italic pt-1 border-t border-border/30">
              {data.notes}
            </p>
          )}
          {data.groups && data.groups.length > 0 && (
            <div className="pt-2 mt-2 border-t border-border/40 space-y-1.5">
              {data.groups.map((g, gi) => (
                <div key={gi} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground capitalize">{g.name} ({g.count}):</span>
                  <span className="text-foreground font-semibold">{g.formattedAmount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    case "overdue_invoice_summary": {
      return (
        <div className={cn("space-y-2.5 rounded-xl border border-rose-500/30 bg-card/70 p-4 shadow-sm", className)}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
            <AlertCircle className="h-4 w-4" />
            <span>Overdue invoices</span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-mono text-3xl font-extrabold tracking-tight text-foreground">
              {data.count.toLocaleString("en-IN")}
            </span>
            <span className="font-mono text-lg font-bold text-rose-400">
              ₹{data.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
            {data.count === 1 ? "invoice is" : "invoices are"} overdue · total outstanding
          </p>
        </div>
      );
    }

    case "customer_receivables_summary": {
      const money = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
      return (
        <div className={cn("space-y-3 rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm", className)}>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Receipt className="h-4 w-4 text-primary" />
              <span>Payment summary</span>
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-foreground">{data.customerName}</div>
          </div>
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment pending</div>
            <div className="mt-1 font-mono text-2xl font-bold text-emerald-400">{money(data.totalOutstanding)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {[["Total invoiced", data.totalInvoiced], ["Received", data.totalPaid], ["Taxable sales", data.totalRevenue]].map(([label, value]) => (
              <div key={String(label)} className="min-w-0 rounded border border-border/50 p-2">
                <div className="truncate text-[10px] text-muted-foreground">{String(label)}</div>
                <div className="mt-1 truncate font-mono font-semibold text-foreground">{money(Number(value))}</div>
              </div>
            ))}
          </div>
          {data.invoices.length > 0 && (
            <div className="space-y-1 border-t border-border/40 pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoices</div>
              {data.invoices.slice(0, 4).map((invoice) => (
                <div key={invoice.number} className="flex min-w-0 items-center justify-between gap-3 text-[11px]">
                  <span className="truncate font-mono text-foreground">{invoice.number}</span>
                  <span className="shrink-0 font-mono text-muted-foreground">Due {money(invoice.outstanding)}</span>
                </div>
              ))}
              {data.invoices.length > 4 && <div className="text-[10px] text-muted-foreground">and {data.invoices.length - 4} more invoices</div>}
            </div>
          )}
        </div>
      );
    }

    case "sales_period_summary": {
      const money = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
      const metrics = [
        {
          label: "Recognized revenue",
          value: money(data.revenue),
          detail: `${data.invoiceCount.toLocaleString("en-IN")} issued ${data.invoiceCount === 1 ? "invoice" : "invoices"} · excluding GST · by invoice date`,
          valueClass: "text-emerald-400",
        },
        {
          label: "Payments received",
          value: money(data.paymentsReceived),
          detail: `${data.paymentCount.toLocaleString("en-IN")} recorded ${data.paymentCount === 1 ? "payment" : "payments"} · by payment date`,
          valueClass: "text-sky-400",
        },
        ...(data.receivables !== undefined ? [{
          label: "Customer receivables",
          value: money(data.receivables),
          detail: "Outstanding across all issued invoices",
          valueClass: "text-amber-400",
        }] : []),
      ];

      return (
        <section aria-label={`Sales summary for ${data.period}`} className={cn("overflow-hidden rounded-xl border border-border/70 bg-card/70 shadow-sm", className)}>
          <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span>Sales summary</span>
            </div>
            <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {data.period}
            </span>
          </header>
          <div className="divide-y divide-border/40 px-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground">{metric.label}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{metric.detail}</div>
                </div>
                <div className={cn("shrink-0 pt-0.5 text-right font-mono text-sm font-bold tabular-nums sm:text-base", metric.valueClass)}>
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "receivables_portfolio_summary": {
      const money = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
      return (
        <div className={cn("space-y-3 rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm", className)}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Receipt className="h-4 w-4 text-primary" />
            <span>Receivables summary</span>
          </div>
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total outstanding</div>
            <div className="mt-1 font-mono text-2xl font-bold text-emerald-400">{money(data.totalOutstanding)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {[["Invoices", data.invoiceCount], ["Total invoiced", data.totalInvoiced], ["Received", data.totalPaid], ["Taxable sales", data.totalRevenue]].map(([label, value]) => (
              <div key={String(label)} className="min-w-0 rounded border border-border/50 p-2">
                <div className="truncate text-[10px] text-muted-foreground">{String(label)}</div>
                <div className="mt-1 truncate font-mono font-semibold text-foreground">{label === "Invoices" ? Number(value).toLocaleString("en-IN") : money(Number(value))}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "safety_refusal": {
      return (
        <div className={cn("p-4 rounded-xl border border-rose-500/40 bg-gradient-to-br from-rose-500/15 via-rose-950/25 to-card/90 backdrop-blur-md shadow-md space-y-2.5 text-xs", className)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-rose-400 text-sm">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>Action Refused · Safety Policy</span>
            </div>
            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 uppercase tracking-wider">
              {data.recordCount ? `${data.recordCount} Drafts Preserved` : "Records Untouched"}
            </span>
          </div>
          <p className="text-zinc-100 text-[13px] font-medium leading-relaxed">
            {data.message}
          </p>
          <div className="text-[12px] text-zinc-300 pt-2 border-t border-rose-500/25 leading-relaxed flex items-start gap-1.5 font-normal">
            <span className="text-rose-400 font-bold">•</span>
            <span>
              {data.policy || "Destructive bulk operations are blocked to prevent accidental data loss. Individual records can be managed directly in the Sales module."}
            </span>
          </div>
        </div>
      );
    }

    case "quote_proposal": {
      return (
        <div className={cn("p-4 rounded-xl border border-purple-500/40 bg-purple-950/15 backdrop-blur-sm shadow-sm space-y-3 text-xs", className)}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-purple-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Quote Proposal</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium border border-amber-500/30 bg-amber-500/10 text-amber-300 uppercase tracking-wider">
              Draft — Not saved
            </span>
          </div>

          {/* Specifications */}
          <div className="grid grid-cols-2 gap-2 text-[11.5px] bg-background/40 p-2.5 rounded-lg border border-purple-500/10">
            <div>
              <span className="text-muted-foreground block text-[10.5px]">Customer</span>
              <span className="font-medium text-foreground">{data.customer}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10.5px]">Item</span>
              <span className="font-medium text-foreground">{data.item}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10.5px]">Quantity</span>
              <span className="font-mono text-foreground">{data.quantity} {data.unit || ""}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10.5px]">Unit Price</span>
              <span className="font-mono text-foreground">{data.formattedUnitPrice}</span>
            </div>
          </div>

          {/* Pricing breakdown */}
          <div className="space-y-1 pt-1 font-mono text-[11.5px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal:</span>
              <span>{data.formattedSubtotal}</span>
            </div>
            {data.discount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount:</span>
                <span>-{data.formattedDiscount}</span>
              </div>
            )}
            {data.tax > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax:</span>
                <span>+{data.formattedTax}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-purple-500/20 font-bold text-sm text-foreground">
              <span>Total Amount:</span>
              <span className="text-purple-300">{data.formattedTotal}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAction?.("confirm quote")}
              className="flex-1 px-3 py-1.5 rounded-md font-medium text-xs bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirm Quote</span>
            </button>
            <button
              type="button"
              onClick={() => onAction?.("cancel quote")}
              className="px-3 py-1.5 rounded-md font-medium text-xs border border-border/80 hover:bg-muted text-muted-foreground transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            No quote is saved until confirmed. Replay protection is enforced.
          </p>
        </div>
      );
    }

    case "quote_saved": {
      return (
        <div className={cn("p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/15 backdrop-blur-sm shadow-sm space-y-2 text-xs", className)}>
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Quote Successfully Saved</span>
          </div>
          <div className="flex items-baseline justify-between pt-1 font-mono">
            <div>
              <span className="text-muted-foreground text-[11px]">Quote Number: </span>
              {data.route ? (
                <Link href={data.route} className="font-bold text-primary hover:underline">
                  {data.quoteNumber}
                </Link>
              ) : (
                <span className="font-bold text-foreground">{data.quoteNumber}</span>
              )}
            </div>
            <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wider", getStatusBadgeClass(data.status))}>
              {formatStatusLabel(data.status)}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1 border-t border-emerald-500/20 text-xs">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-mono font-bold text-base text-foreground">{data.formattedTotal}</span>
          </div>
        </div>
      );
    }

    case "not_found": {
      return (
        <div className={cn("p-4 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-amber-950/30 to-card/90 backdrop-blur-md shadow-md space-y-2.5 text-xs", className)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-amber-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Record Not Found</span>
            </div>
            {data.identifier && (
              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-200">
                {data.identifier}
              </span>
            )}
          </div>
          <p className="text-zinc-100 text-[13px] font-medium leading-relaxed">
            {data.message}
          </p>
          <div className="text-[12px] text-zinc-300 pt-2 border-t border-amber-500/25 leading-relaxed flex items-start gap-1.5 font-normal">
            <span className="text-amber-400 font-bold">•</span>
            <span>Verify the document identifier or customer name, or check your workspace module permissions.</span>
          </div>
        </div>
      );
    }

    case "plan_info": {
      return (
        <div className={cn("p-4 rounded-xl border border-border/70 bg-card/70 backdrop-blur-sm shadow-sm space-y-2.5 text-xs", className)}>
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <CreditCard className="w-4 h-4 text-primary" />
              <span>Workspace Account Plan</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-primary/30 bg-primary/10 text-primary">
              {data.plan}
            </span>
          </div>
          {data.status && (
            <div className="text-[11.5px]">
              <span className="text-muted-foreground">Subscription Status: </span>
              <span className="capitalize font-medium text-foreground">{data.status}</span>
            </div>
          )}
          {data.modules && data.modules.length > 0 && (
            <div className="space-y-1">
              <span className="text-muted-foreground text-[11px] block">Accessible Modules:</span>
              <div className="flex flex-wrap gap-1">
                {data.modules.map((m) => (
                  <span key={m} className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/50 text-[10.5px] capitalize font-medium text-foreground">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
          {data.limits && (
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
              <span>AI Credit Limit: </span>
              <span className="font-mono text-foreground">{data.limits}</span>
            </div>
          )}
        </div>
      );
    }

    case "profit_loss": {
      const isProfitable = data.status === "profitable";
      const isLoss = data.status === "loss";
      const isIncomplete = data.status === "incomplete_data" || data.status === "unavailable";
      const hasCogs = data.cogs !== undefined;
      const details = data.details;
      const hasDetails = Boolean(
        details &&
        ((details.revenueBreakdown && details.revenueBreakdown.length > 0) ||
         (details.expenseBreakdown && details.expenseBreakdown.length > 0) ||
         (details.cogsBreakdown && details.cogsBreakdown.length > 0))
      );

      return (
        <div className={cn("p-4 rounded-xl border border-border/70 bg-card/70 backdrop-blur-sm shadow-sm space-y-3 text-xs", className)}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
              {isProfitable ? (
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              ) : isLoss ? (
                <TrendingDown className="w-4 h-4 text-rose-500" />
              ) : (
                <Receipt className="w-4 h-4 text-amber-500" />
              )}
              <span>{data.title || "Profit & Loss Analysis"}</span>
            </div>
            <span
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                isProfitable
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : isLoss
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              )}
            >
              {data.status.replace("_", " ")}
            </span>
          </div>

          {/* Period Banner */}
          {data.period && (
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/40 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>{data.period.label}</span>
              </div>
              {data.period.startDate && data.period.endDate ? (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {String(data.period.startDate)} → {String(data.period.endDate)}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground italic">Full ledger span</span>
              )}
            </div>
          )}

          {/* Metrics Grid */}
          <div className={cn("grid gap-2 py-1 text-center font-mono", hasCogs ? "grid-cols-4" : "grid-cols-3")}>
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block uppercase font-sans">Revenue</span>
              <span className="font-bold text-sm text-foreground">{data.formattedRevenue}</span>
            </div>
            {hasCogs && (
              <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
                <span className="text-[10px] text-muted-foreground block uppercase font-sans">COGS</span>
                <span className="font-bold text-sm text-foreground">{data.formattedCogs}</span>
              </div>
            )}
            <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
              <span className="text-[10px] text-muted-foreground block uppercase font-sans">
                {hasCogs ? "OpEx" : "Expenses"}
              </span>
              <span className="font-bold text-sm text-foreground">
                {hasCogs ? (data.formattedOperatingExpenses || data.formattedExpenses) : data.formattedExpenses}
              </span>
            </div>
            <div
              className={cn(
                "p-2 rounded-lg border",
                isProfitable
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : isLoss
                  ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                  : "bg-muted/40 border-border/40 text-foreground"
              )}
            >
              <span className="text-[10px] text-muted-foreground block uppercase font-sans">Net</span>
              <span className="font-bold text-sm">{data.formattedNetProfit}</span>
            </div>
          </div>

          {/* COGS Explanation Callout */}
          {data.cogsExplanation && (
            <div className="px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/40 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span>{data.cogsExplanation}</span>
            </div>
          )}

          {/* Calculation Details Breakdown */}
          {hasDetails && (
            <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40 space-y-2 text-[11px]">
              <div className="font-semibold text-foreground flex items-center justify-between">
                <span>Account Breakdown</span>
                <span className="text-[10px] text-muted-foreground font-normal">Authoritative posted ledger</span>
              </div>
              {details?.cogsBreakdown && details.cogsBreakdown.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Direct Costs (COGS)</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mt-0.5">
                    {details.cogsBreakdown.map((acc, i) => (
                      <div key={i} className="flex justify-between items-center text-muted-foreground font-mono">
                        <span className="truncate pr-1">
                          {acc.accountName} ({acc.accountCode})
                          {acc.entryCount !== undefined ? ` • ${acc.entryCount} ${acc.entryCount === 1 ? "entry" : "entries"}` : ""}:
                        </span>
                        <span className="font-semibold text-foreground shrink-0">{acc.formattedAmount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {details?.expenseBreakdown && details.expenseBreakdown.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Operating Expenses</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mt-0.5">
                    {details.expenseBreakdown.map((acc, i) => (
                      <div key={i} className="flex justify-between items-center text-muted-foreground font-mono">
                        <span className="truncate pr-1">
                          {acc.accountName} ({acc.accountCode})
                          {acc.entryCount !== undefined ? ` • ${acc.entryCount} ${acc.entryCount === 1 ? "entry" : "entries"}` : ""}:
                        </span>
                        <span className="font-semibold text-foreground shrink-0">{acc.formattedAmount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {details?.revenueBreakdown && details.revenueBreakdown.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Revenue</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mt-0.5">
                    {details.revenueBreakdown.map((acc, i) => (
                      <div key={i} className="flex justify-between items-center text-muted-foreground font-mono">
                        <span className="truncate pr-1">
                          {acc.accountName} ({acc.accountCode})
                          {acc.entryCount !== undefined ? ` • ${acc.entryCount} ${acc.entryCount === 1 ? "entry" : "entries"}` : ""}:
                        </span>
                        <span className="font-semibold text-foreground shrink-0">{acc.formattedAmount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {details?.crossModuleCoverage && (
                <div className="pt-2 border-t border-border/30 space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Cross-Module Ledger Coverage</span>
                  <div className="space-y-1 text-[10.5px] text-muted-foreground">
                    {details.crossModuleCoverage.notes.map((note, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 leading-snug">
                        <span className="text-primary font-bold">•</span>
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Missing data / Limitations */}
          {data.limitations && (
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
              <span>{data.limitations}</span>
            </div>
          )}

          {/* Footer with Basis and Timestamp */}
          <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>Basis: {data.basis.replace(/_/g, " ")}</span>
              {data.postedEntryCount !== undefined && data.postedEntryCount > 0 && (
                <span className="font-mono">• {data.postedEntryCount} posted entries</span>
              )}
            </span>
            {data.generatedAt && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/80 font-mono">
                <Clock className="w-3 h-3 text-muted-foreground/60" />
                <span>{new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
              </span>
            )}
          </div>
        </div>
      );
    }

    case "customer_proposal": {
      const missing = data.missingFields || [];
      const hasMissing = missing.length > 0;

      return (
        <div className={cn("p-4 rounded-xl border border-primary/30 bg-card/80 backdrop-blur-sm shadow-sm space-y-3 text-xs", className)}>
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
              <UserPlus className="w-4 h-4 text-primary" />
              <span>Customer Draft — Review</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Draft / Unsaved
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-semibold text-foreground">{data.name || "Missing"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Type:</span>
              <span className="capitalize font-medium text-foreground">
                {data.isCompany === true ? "Company" : data.isCompany === false ? "Individual" : "Not specified"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Phone:</span>
              <span className={cn(data.phone ? "font-mono text-foreground" : "text-muted-foreground")}>
                {data.phone || "Not provided"}
              </span>
            </div>
            {data.email && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-mono text-foreground">{data.email}</span>
              </div>
            )}
          </div>

          {hasMissing ? (
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px]">
              Missing details: please supply <strong>{missing.join(" and ")}</strong> before confirming.
            </div>
          ) : (
            <div className="flex gap-2 pt-2 border-t border-border/60">
              {onAction && (
                <>
                  <button
                    onClick={() => onAction("confirm customer")}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm Customer</span>
                  </button>
                  <button
                    onClick={() => onAction("cancel customer")}
                    className="px-3 py-1.5 rounded-lg border border-border/70 bg-card hover:bg-muted text-muted-foreground text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    case "customer_saved": {
      return (
        <div className={cn("p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 backdrop-blur-sm shadow-sm space-y-2 text-xs", className)}>
          <div className="flex items-center gap-2 font-semibold text-emerald-400 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>Customer Successfully Saved</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="font-bold text-foreground text-sm">{data.name}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              {data.isCompany ? "Company" : "Individual"}
            </span>
          </div>
          {data.route && (
            <div className="pt-2 border-t border-emerald-500/20 text-[11px]">
              <Link href={data.route} className="text-primary hover:underline flex items-center gap-1">
                <span>View in Customer Master</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
      );
    }

    case "role_change_proposal": {
      return (
        <div className={cn("p-4 rounded-xl border border-amber-500/40 bg-card/80 backdrop-blur-sm shadow-sm space-y-3 text-xs", className)}>
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2 font-semibold text-amber-400 text-sm">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Role Change — Confirmation Required</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Sensitive Mutation
            </span>
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-muted-foreground text-[11px] block">
                {data.employeeId ? "Target Employee:" : "Target User:"}
              </span>
              <span className="font-semibold text-foreground text-[13px]">{data.userName}</span>
              {data.employeeCode && (
                <span className="text-muted-foreground text-[11px] ml-1.5 font-mono">
                  (ID: {data.employeeCode})
                </span>
              )}
              {data.department && (
                <span className="text-muted-foreground text-[11px] ml-1.5 font-mono">
                  · {data.department}
                </span>
              )}
              {data.userEmail && <span className="text-muted-foreground text-[11px] ml-1.5 font-mono">({data.userEmail})</span>}
            </div>

            <div className="flex items-center gap-2 pt-1 font-mono text-[11.5px]">
              <span className="px-2 py-0.5 rounded bg-muted/60 border border-border/60 text-muted-foreground">
                {data.currentRoleLabel || data.currentRole}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary font-bold">
                {data.proposedRoleLabel || data.proposedRole}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2">
            Role updates modify organizational designation, entitlements, and permissions. Explicit human confirmation is required.
          </p>

          {onAction && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onAction("confirm role change")}
                className="flex-1 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirm Role Change</span>
              </button>
              <button
                onClick={() => onAction("cancel role")}
                className="px-3 py-1.5 rounded-lg border border-border/70 bg-card hover:bg-muted text-muted-foreground text-xs transition flex items-center justify-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>
          )}
        </div>
      );
    }

    case "role_changed": {
      return (
        <div className={cn("p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 backdrop-blur-sm shadow-sm space-y-2 text-xs", className)}>
          <div className="flex items-center gap-2 font-semibold text-emerald-400 text-sm">
            <ShieldCheck className="w-4 h-4" />
            <span>Role Successfully Changed</span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="font-bold text-foreground text-sm">
              {data.userName}
              {data.employeeCode ? ` (${data.employeeCode})` : ""}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {data.newRoleLabel || data.newRole}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground border-t border-emerald-500/20 pt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Persisted in database & logged to CRM Audit Log</span>
          </p>
        </div>
      );
    }

    default:
      return fallbackText ? (
        <div className={cn("whitespace-pre-wrap rounded-lg border border-border/70 bg-card/70 p-3 text-sm leading-relaxed text-foreground", className)}>
          {fallbackText}
        </div>
      ) : (
        <div className={cn("rounded-lg border border-border/70 bg-card/70 p-3 text-sm text-muted-foreground", className)}>
          I received a result but couldn’t display its details.
        </div>
      );
  }
}

export default StructuredErpView;
