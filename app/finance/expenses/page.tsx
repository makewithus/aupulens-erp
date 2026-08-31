"use client";

import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import { Plus } from "lucide-react";

// Extracted Subcomponents
import { ExpensesTable } from "@/components/finance/expenses/ExpensesTable";
import { ExpensesModals } from "@/components/finance/expenses/ExpensesModals";

export default function ExpensesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  const filteredExpenses = expenses.filter(
    (exp) =>
      exp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.employeeId?.name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const qs = params.toString();
      const res = await cachedFetch(`/api/finance/expenses${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      setExpenses(json.items || []);
    } catch (error) {
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {

    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleOpenCreate = () => {
    setFormData({
      description: "",
      category: "others",
      total: 0,
      taxAmount: 0,
      isTaxIncluded: false,
      paidBy: "employee",
      expenseDate: new Date(),
      status: "draft",
      notes: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (expense: any) => {
    setFormData({ ...expense });
    setIsModalOpen(true);
  };

  // AI-native: the assistant extracts expense details → open the create modal
  // pre-filled with them. The user still reviews/picks the account and clicks
  // Submit, so nothing is written without human approval.
  useAiPrefill("expense", (p) => {
    const d = p.data || {};
    setFormData({
      description: d.description || "",
      category: d.category || "others",
      total: Number(d.total) || 0,
      taxAmount: Number(d.taxAmount) || 0,
      isTaxIncluded: !!d.isTaxIncluded,
      paidBy: d.paidBy || "employee",
      expenseDate: d.expenseDate ? new Date(d.expenseDate) : new Date(),
      status: "draft",
      notes: d.notes || "",
      ...(d.accountId ? { accountId: d.accountId } : {}),
    });
    setIsModalOpen(true);
  });

  const handleSubmit = async (statusOverride?: string) => {
    if (!formData.description || !formData.accountId) {
      toast.error("Description and Account are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const isUpdate = !!formData._id;
      const url = isUpdate
        ? `/api/finance/expenses/${formData._id}`
        : "/api/finance/expenses";
      const method = isUpdate ? "PATCH" : "POST";

      const payload = {
        ...formData,
        status: statusOverride || formData.status || "draft",
      };

      const res = await cachedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(
          statusOverride === "submitted"
            ? "Expense submitted for approval"
            : isUpdate
              ? "Expense updated"
              : "Expense created",
        );
        setIsModalOpen(false);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Execution failed");
      }
    } catch (error) {
      toast.error("Submission error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    setIsSubmitting(true);
    try {
      const res = await cachedFetch(`/api/finance/expenses/${formData._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, status: newStatus }),
      });

      if (res.ok) {
        toast.success(`Expense ${newStatus}`);
        setFormData((prev: any) => ({ ...prev, status: newStatus }));
        load();
        if (newStatus === "posted" || newStatus === "refused") {
          setIsModalOpen(false);
        }
      } else {
        const err = await res.json();
        toast.error(err.error || "Update failed");
      }
    } catch (error) {
      toast.error("Status update error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: "Are you sure?" })) return;
    try {
      const res = await cachedFetch(`/api/finance/expenses/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Expense deleted");
        load();
      }
    } catch (error) {
      toast.error("Delete error");
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      dashboardTitle="Finance"
      pageName="Employee Expenses"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Expenses" },
      ]}
      userEmail={session?.user?.email || ""}
    >
      <div className="space-y-1">
        {/* Page Header Spacer */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-2"></div>

        {/* Table & Filtering Card */}
        <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
          {/* Card Toolbar */}
          <div className="border-b border-border/20 px-8 py-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">Employee Expenses</h3>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {filteredExpenses.length} {filteredExpenses.length === 1 ? "Expense" : "Expenses"} Total
                </p>
              </div>

              <div className="w-full max-w-xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                {/* Search input */}
                <div className="w-full max-w-sm">
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search expenses..."
                  />
                </div>

                <DateRangeFilter
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  onDateFromChange={setDateFrom}
                  onDateToChange={setDateTo}
                />

                <Button
                  onClick={handleOpenCreate}
                  className="h-12 px-6 text-primary bg-tertiary border-secondary border hover:bg-muted transition-all rounded-none"
                >
                  <Plus className="h-4 w-4 mr-2" /> Record Expense
                </Button>
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-muted-foreground font-mono text-xs">
                  No expenses found
                </p>
              </div>
            ) : (
              <ExpensesTable
                filteredExpenses={filteredExpenses}
                handleOpenView={handleOpenView}
                handleDelete={handleDelete}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ExpensesModals
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        isSubmitting={isSubmitting}
        formData={formData}
        setFormData={setFormData}
        handleSubmit={handleSubmit}
        handleUpdateStatus={handleUpdateStatus}
      />
    </DashboardLayout>
  );
}
