"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Eye,
  Trash2,
  ChevronRight,
  FileText,
  CheckCircle2,
  ShieldCheck,
  Send,
  BookOpen,
  Ban,
  RotateCcw,
  Minus,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { JournalEntryPopupContent } from "@/components/accounting/JournalEntryPopupContent";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VOUCHER_TYPE,
  VOUCHER_TYPE_VALUES,
  VOUCHER_TYPE_LABELS,
  VOUCHER_TYPE_COLORS,
  VOUCHER_STATUS,
  VOUCHER_STATUS_LABELS,
  VOUCHER_STATUS_COLORS,
  VOUCHER_FLOW_STEPS,
  type VoucherType,
  type VoucherStatus,
} from "@/lib/constants/statuses";

/* ------------------------------------------------------------------ */
/*  Flow Progress Stepper                                              */
/* ------------------------------------------------------------------ */

const STEP_ICONS: Record<string, any> = {
  draft: FileText,
  validated: ShieldCheck,
  pending_approval: Send,
  approved: CheckCircle2,
  posted: BookOpen,
};

function VoucherFlowStepper({ current }: { current: VoucherStatus }) {
  const currentIdx = VOUCHER_FLOW_STEPS.indexOf(current);
  const isSpecial = (
    [VOUCHER_STATUS.REJECTED, VOUCHER_STATUS.CANCELLED] as VoucherStatus[]
  ).includes(current);

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {VOUCHER_FLOW_STEPS.map((step, idx) => {
        const Icon = STEP_ICONS[step] || FileText;
        const label = VOUCHER_STATUS_LABELS[step];
        const isDone = !isSpecial && currentIdx > idx;
        const isActive = step === current;

        return (
          <div key={step} className="flex items-center">
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs whitespace-nowrap ${
                isActive
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold"
                  : isDone
                    ? "text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 ${isDone ? "text-green-500" : ""}`}
              />
              {label}
            </div>
            {idx < VOUCHER_FLOW_STEPS.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5 shrink-0" />
            )}
          </div>
        );
      })}
      {isSpecial && (
        <div className="flex items-center">
          <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />
          <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
            <Ban className="h-3.5 w-3.5" />
            {VOUCHER_STATUS_LABELS[current]}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Context-aware action buttons                                       */
/* ------------------------------------------------------------------ */

function VoucherActions({
  item,
  onAdvance,
  isSubmitting,
}: {
  item: any;
  onAdvance: (id: string, nextStatus: VoucherStatus, reason?: string) => void;
  isSubmitting: boolean;
}) {
  const vs = item.voucherStatus as VoucherStatus;

  switch (vs) {
    case VOUCHER_STATUS.DRAFT:
      return (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onAdvance(item._id, VOUCHER_STATUS.VALIDATED)}
            disabled={isSubmitting}
          >
            <ShieldCheck className="h-4 w-4 mr-1" /> Validate
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onAdvance(item._id, VOUCHER_STATUS.CANCELLED)}
            disabled={isSubmitting}
          >
            <Ban className="h-4 w-4 mr-1" /> Cancel
          </Button>
        </div>
      );
    case VOUCHER_STATUS.VALIDATED:
      return (
        <div className="flex gap-2">
          {item.approvalRequired ? (
            <Button
              size="sm"
              onClick={() =>
                onAdvance(item._id, VOUCHER_STATUS.PENDING_APPROVAL)
              }
              disabled={isSubmitting}
            >
              <Send className="h-4 w-4 mr-1" /> Submit for Approval
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onAdvance(item._id, VOUCHER_STATUS.APPROVED)}
              disabled={isSubmitting}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
            </Button>
          )}
        </div>
      );
    case VOUCHER_STATUS.PENDING_APPROVAL:
      return (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => onAdvance(item._id, VOUCHER_STATUS.APPROVED)}
            disabled={isSubmitting}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={async () => {
              const reason = prompt("Rejection reason:");
              if (reason !== null) {
                onAdvance(item._id, VOUCHER_STATUS.REJECTED, reason);
              }
            }}
            disabled={isSubmitting}
          >
            <Ban className="h-4 w-4 mr-1" /> Reject
          </Button>
        </div>
      );
    case VOUCHER_STATUS.APPROVED:
      return (
        <Button
          size="sm"
          onClick={() => onAdvance(item._id, VOUCHER_STATUS.POSTED)}
          disabled={isSubmitting}
        >
          <BookOpen className="h-4 w-4 mr-1" /> Post & Update Ledger
        </Button>
      );
    case VOUCHER_STATUS.REJECTED:
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAdvance(item._id, VOUCHER_STATUS.DRAFT)}
          disabled={isSubmitting}
        >
          <RotateCcw className="h-4 w-4 mr-1" /> Re-draft
        </Button>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function VouchersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("voucherType", typeFilter);
      if (statusFilter !== "all") params.set("voucherStatus", statusFilter);
      const res = await fetch(
        `/api/finance/journal-entries?${params.toString()}`,
      );
      const json = await res.json();
      // Only show items that have a voucherType
      setItems((json.items || []).filter((i: any) => i.voucherType));
    } catch (error) {
      toast.error("Failed to load vouchers");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/finance");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleOpenAction = (actionName: string) => {
    setFormData({
      header: {
        name: "",
        date: new Date(),
        ref: "",
        journalType: "general",
      },
      voucherType: "journal", // System will auto-classify
      actionName, // Pass actionName to set a more intuitive title
      voucherStatus: VOUCHER_STATUS.DRAFT,
      approvalRequired: false,
      lineIds: [
        { accountId: "", partnerId: "", label: "", debit: 0, credit: 0 },
        { accountId: "", partnerId: "", label: "", debit: 0, credit: 0 },
      ],
      totals: { amountUntaxed: 0, amountTax: 0, amountTotal: 0 },
      status: "draft",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (item: any) => {
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleSave = async (saveStatus?: string) => {
    const isDraft = saveStatus === "draft" || !saveStatus;

    // Only enforce balance for posting, not drafts
    if (!isDraft) {
      const totalDebit = (formData.lineIds || []).reduce(
        (sum: number, l: any) => sum + (parseFloat(l.debit) || 0),
        0,
      );
      const totalCredit = (formData.lineIds || []).reduce(
        (sum: number, l: any) => sum + (parseFloat(l.credit) || 0),
        0,
      );
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        toast.error("Voucher must be balanced before posting!");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const isUpdate = !!formData._id;
      const url = isUpdate
        ? `/api/finance/journal-entries/${formData._id}`
        : "/api/finance/journal-entries";

      // Normalize populated objects → plain ObjectId strings
      const normalizeId = (v: any) => {
        if (!v) return "";
        if (typeof v === "string") return v;
        return v._id ? String(v._id) : "";
      };

      const normalizedLines = (formData.lineIds || []).map((l: any) => ({
        ...l,
        accountId: normalizeId(l.accountId),
        partnerId: normalizeId(l.partnerId),
      }));

      const payload = {
        ...formData,
        lineIds: normalizedLines,
        status: saveStatus || formData.status || "draft",
        voucherStatus: saveStatus
          ? VOUCHER_STATUS.DRAFT
          : formData.voucherStatus,
      };

      let res = await fetch(url, {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message: string = err.error || "Failed to save";

        // Semantic (ledger-category pairing) errors have an explicit
        // override path — see the same handling in journal-entries/page.tsx.
        if (message.startsWith("Semantic Error:")) {
          const confirmed = await confirmDialog({
            title: "Non-standard account pairing",
            description: `${message} This may be a legitimate contra/adjustment entry. Continue anyway? This will be recorded on the entry for audit purposes.`,
          });
          if (!confirmed) {
            setIsSubmitting(false);
            return;
          }
          res = await fetch(url, {
            method: isUpdate ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, allowNonStandard: true }),
          });
          if (!res.ok) {
            const retryErr = await res.json().catch(() => ({}));
            throw new Error(retryErr.error || "Failed to save");
          }
        } else {
          throw new Error(message);
        }
      }

      toast.success("Voucher saved as draft");
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleAdvance = async (
    id: string,
    nextStatus: VoucherStatus,
    reason?: string,
  ) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/finance/journal-entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucherStatus: nextStatus,
          rejectionReason: reason,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Transition failed");
      }
      toast.success(`Voucher → ${VOUCHER_STATUS_LABELS[nextStatus]}`);
      load();
      setIsModalOpen(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: "Delete this voucher?" })) return;
    try {
      const res = await fetch(`/api/finance/journal-entries/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Delete failed");
      }
      toast.success("Voucher deleted");
      load();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const filtered = items.filter((item) =>
    [
      item.header?.name,
      item.header?.ref || "",
      item.voucherType || "",
    ].some((v) => v.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Transactions"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Transactions" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "finance"}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Transactions
            </h1>
            <p className="text-sm text-muted-foreground">
              Action-driven accounting ·{" "}
              <span className="font-medium text-primary">
                Smart Accounting Engine · Just enter what happened
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 w-56 bg-background"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {VOUCHER_FLOW_STEPS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {VOUCHER_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Quick-create voucher type cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { id: "Record Expense", icon: FileText, color: "bg-orange-100 text-orange-700 hover:border-orange-500" },
            { id: "Receive Payment", icon: Plus, color: "bg-green-100 text-green-700 hover:border-green-500" },
            { id: "Make Payment", icon: Send, color: "bg-blue-100 text-blue-700 hover:border-blue-500" },
            { id: "Manual Journal", icon: BookOpen, color: "bg-purple-100 text-purple-700 hover:border-purple-500" },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleOpenAction(action.id)}
                className={`p-4 rounded-xl border-2 border-dashed transition-all text-center group ${action.color} hover:shadow-md`}
              >
                <Icon className="h-5 w-5 mx-auto mb-1 opacity-80 group-hover:opacity-100" />
                <span className="text-xs font-bold tracking-wide">
                  {action.id}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <Card className="border-none shadow-none bg-transparent">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-background rounded-xl border border-dashed">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground">No transactions found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Record a transaction using the actions above
                </p>
              </div>
            ) : (
              <div className="bg-background rounded-xl border overflow-hidden">
                <Table className="min-w-full divide-y divide-border">
                  <TableHeader className="bg-muted/50">
                    <TableRow className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                      <TableHead className="px-4 py-4 text-left">Date</TableHead>
                      <TableHead className="px-4 py-4 text-left">Number</TableHead>

                      <TableHead className="px-4 py-4 text-left">Ref</TableHead>
                      <TableHead className="px-4 py-4 text-right">Total</TableHead>
                      <TableHead className="px-4 py-4 text-left">Flow</TableHead>
                      <TableHead className="px-4 py-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {filtered.map((item) => {
                      const typeColors =
                        VOUCHER_TYPE_COLORS[
                          item.voucherType as VoucherType
                        ] || { bg: "", text: "" };
                      return (
                        <TableRow
                          key={item._id}
                          className="hover:bg-muted/20 transition-colors text-sm group"
                        >
                          <TableCell className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                            {new Date(
                              item.header?.date,
                            ).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap font-bold text-primary">
                            {item.header?.name}
                          </TableCell>

                          <TableCell className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                            {item.header?.ref || "-"}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right font-black">
                            ₹
                            {item.totals?.amountTotal?.toLocaleString() ??
                              0}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <VoucherFlowStepper
                              current={item.voucherStatus as VoucherStatus}
                            />
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleOpenView(item)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {item.voucherStatus === VOUCHER_STATUS.DRAFT && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleDelete(item._id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          formData?.header?.name ||
          formData?.actionName ||
          (formData?.voucherType && formData.voucherType !== "journal"
            ? `New ${VOUCHER_TYPE_LABELS[formData.voucherType as VoucherType]}`
            : "New Transaction")
        }
        className="max-w-[90vw] w-full"
        footer={
          <div className="flex items-center justify-between w-full px-6 py-4">
            <div>
              {formData?.voucherStatus && (
                <VoucherFlowStepper
                  current={formData.voucherStatus as VoucherStatus}
                />
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Close
              </Button>
              {formData?.voucherStatus === VOUCHER_STATUS.DRAFT && (
                <Button
                  variant="secondary"
                  onClick={() => handleSave("draft")}
                  disabled={isSubmitting}
                >
                  Save Draft
                </Button>
              )}
              {formData?._id && (
                <VoucherActions
                  item={formData}
                  onAdvance={handleAdvance}
                  isSubmitting={isSubmitting}
                />
              )}
              {formData?.voucherStatus === VOUCHER_STATUS.POSTED && (
                <p className="text-sm text-muted-foreground italic flex items-center">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />{" "}
                  Posted & ledger updated
                </p>
              )}
            </div>
          </div>
        }
      >
        {formData && (
          <div className="space-y-4">
            {/* Voucher type + approval badge */}
            <div className="flex items-center gap-3 px-1">
              {formData._id && formData.voucherType && (
                <Badge
                  className={`${VOUCHER_TYPE_COLORS[formData.voucherType as VoucherType]?.bg} ${VOUCHER_TYPE_COLORS[formData.voucherType as VoucherType]?.text} capitalize`}
                >
                  {VOUCHER_TYPE_LABELS[formData.voucherType as VoucherType]}
                </Badge>
              )}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={formData.approvalRequired || false}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      approvalRequired: e.target.checked,
                    })
                  }
                  disabled={
                    formData.voucherStatus !== VOUCHER_STATUS.DRAFT
                  }
                  className="accent-primary"
                />
                Requires approval
              </label>
            </div>
            <JournalEntryPopupContent
              formData={formData}
              setFormData={setFormData}
              isViewOnly={
                formData.voucherStatus === VOUCHER_STATUS.POSTED ||
                formData.voucherStatus === VOUCHER_STATUS.CANCELLED
              }
            />
          </div>
        )}
      </ModularModal>
    </DashboardLayout>
  );
}
