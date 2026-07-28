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
  BookOpen,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ChevronRight,
  FileText,
  ShieldCheck,
  Send,
  Ban,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { JournalEntryPopupContent } from "@/components/accounting/JournalEntryPopupContent";
import {
  VOUCHER_STATUS,
  VOUCHER_STATUS_LABELS,
  VOUCHER_STATUS_COLORS,
  VOUCHER_FLOW_STEPS,
  VOUCHER_TYPE_LABELS,
  VOUCHER_TYPE_COLORS,
  type VoucherStatus,
  type VoucherType,
} from "@/lib/constants/statuses";

export default function JournalEntriesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 25;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  const load = useCallback(async (currentPage = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      const res = await fetch(`/api/finance/journal-entries?${params.toString()}`);
      const json = await res.json();
      setItems(json.items || []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
    } catch (error) {
      toast.error("Failed to load journal entries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/finance");
    if (status === "authenticated") load(page);
  }, [status, router, load, page]);

  const handleOpenCreate = () => {
    setFormData({
      header: {
        name: "", // Will be auto-generated if empty
        date: new Date(),
        ref: "",
        journalType: "general",
      },
      lineIds: [
        { accountId: "", partnerId: "", label: "", debit: 0, credit: 0 },
        { accountId: "", partnerId: "", label: "", debit: 0, credit: 0 },
      ],
      totals: {
        amountUntaxed: 0,
        amountTax: 0,
        amountTotal: 0,
      },
      status: "draft",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (item: any) => {
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleSubmit = async (newStatus?: string) => {
    const isDraft = !newStatus || newStatus === "draft";

    // Only enforce balancing when POSTING, not for drafts
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
        toast.error("Journal entry must be balanced before posting!");
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
        status: newStatus || formData.status || "draft",
      };

      let res = await fetch(url, {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const message: string = errJson.error || "Failed to save entry";

        // Semantic (ledger-category pairing) errors have an explicit
        // override path — the accountant may genuinely need a non-standard
        // entry (e.g. a contra/adjustment). Re-post with allowNonStandard so
        // it's logged rather than silently blocked with no way through.
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
            throw new Error(retryErr.error || "Failed to save entry");
          }
        } else {
          throw new Error(message);
        }
      }

      toast.success(
        payload.status === "posted"
          ? "Journal entry posted successfully"
          : "Journal entry saved as draft",
      );
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: "Are you sure you want to delete this entry?" })) return;
    try {
      const res = await fetch(`/api/finance/journal-entries/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Entry deleted");
        load();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to delete entry");
      }
    } catch (error) {
      toast.error("Delete error");
    }
  };

  const filtered = items.filter((item) =>
    [
      item.header?.name,
      item.header?.ref || "",
      item.header?.journalType || "",
    ].some((v) => v.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Journal Entries"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Journal Entries" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "finance"}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Journal Entries
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage and review accounting entries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 w-64 bg-background"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" /> New Entry
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-none bg-transparent">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-background rounded-xl border border-dashed">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground">
                  No journal entries found
                </p>
              </div>
            ) : (
              <div className="bg-background rounded-xl border overflow-hidden">
                <Table className="min-w-full divide-y divide-border">
                  <TableHeader className="bg-muted/50">
                    <TableRow className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                      <TableHead className="px-6 py-4 text-left">Date</TableHead>
                      <TableHead className="px-6 py-4 text-left">Number</TableHead>
                      <TableHead className="px-6 py-4 text-left">Ref</TableHead>
                      <TableHead className="px-6 py-4 text-left">Journal</TableHead>
                      <TableHead className="px-6 py-4 text-right">Total</TableHead>
                      <TableHead className="px-6 py-4 text-center">Status</TableHead>
                      <TableHead className="px-6 py-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {filtered.map((item) => (
                      <TableRow
                        key={item._id}
                        className="hover:bg-muted/20 transition-colors text-sm group"
                      >
                        <TableCell className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                          {new Date(item.header?.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-6 py-4 whitespace-nowrap font-bold text-primary">
                          {item.header?.name}
                        </TableCell>
                        <TableCell className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                          {item.header?.ref || "-"}
                        </TableCell>
                        <TableCell className="px-6 py-4 whitespace-nowrap capitalize">
                          <Badge variant="outline">
                            {item.header?.journalType}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-black">
                          ₹{item.totals?.amountTotal?.toLocaleString() ?? 0}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-center">
                          {item.voucherType ? (
                            <div className="flex items-center gap-1.5 justify-center">
                              <Badge
                                className={`${VOUCHER_TYPE_COLORS[item.voucherType as VoucherType]?.bg} ${VOUCHER_TYPE_COLORS[item.voucherType as VoucherType]?.text} capitalize text-[10px]`}
                                variant="outline"
                              >
                                {item.voucherType}
                              </Badge>
                              <Badge
                                className={`${VOUCHER_STATUS_COLORS[item.voucherStatus as VoucherStatus]?.bg} ${VOUCHER_STATUS_COLORS[item.voucherStatus as VoucherStatus]?.text} capitalize text-[10px]`}
                              >
                                {VOUCHER_STATUS_LABELS[item.voucherStatus as VoucherStatus] || item.voucherStatus}
                              </Badge>
                            </div>
                          ) : (
                            <Badge
                              variant={
                                item.status === "posted" ? "default" : "secondary"
                              }
                              className="capitalize"
                            >
                              {item.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleOpenView(item)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDelete(item._id)}
                            disabled={item.status === "posted"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <span className="text-sm">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={formData?.header?.name || "New Journal Entry"}
        className="max-w-[90vw] w-full"
        footer={
          <div className="flex justify-end gap-3 px-6 py-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Discard
            </Button>
            {formData?.status !== "posted" && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => handleSubmit("draft")}
                  disabled={isSubmitting}
                >
                  Save as Draft
                </Button>
                <Button
                  onClick={() => handleSubmit("posted")}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Processing..." : "Post Entry"}
                </Button>
              </>
            )}
            {formData?.status === "posted" && (
              <p className="text-sm text-muted-foreground italic flex items-center">
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" /> This
                entry is posted and cannot be modified.
              </p>
            )}
          </div>
        }
      >
        {formData && (
          <JournalEntryPopupContent
            formData={formData}
            setFormData={setFormData}
            isViewOnly={formData.status === "posted"}
          />
        )}
      </ModularModal>
    </DashboardLayout>
  );
}
