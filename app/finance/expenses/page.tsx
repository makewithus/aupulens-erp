"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Receipt,
  Trash2,
  Calendar,
  User,
  Eye,
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { ExpensePopupContent } from "@/components/accounting/ExpensePopupContent";

export default function ExpensesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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
      const res = await fetch("/api/finance/expenses");
      const json = await res.json();
      setExpenses(json.items || []);
    } catch (error) {
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/finance");
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

      const res = await fetch(url, {
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
      const res = await fetch(`/api/finance/expenses/${formData._id}`, {
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
      const res = await fetch(`/api/finance/expenses/${id}`, {
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
      <div className="p-8 space-y-8 max-w-8xl mx-auto">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">
            Employee Expenses
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and approve company and staff expenditure.
          </p>
        </div>

        {/* Search & Actions Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 none-xl border-2 focus:ring-primary/20"
            />
          </div>
          <Button
            onClick={handleOpenCreate}
            className="none-xl h-11 px-6 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all font-black uppercase tracking-tighter group"
          >
            <Plus className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform" />
            Record Expense
          </Button>
        </div>

        {/* Table Section */}
        <Card className="none-[2rem] border-2 shadow-xl overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-12 w-full none-xl" />
                <Skeleton className="h-12 w-full none-xl" />
                <Skeleton className="h-12 w-full none-xl" />
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center text-center px-6">
                <div className="h-20 w-20 none-full bg-muted/30 flex items-center justify-center mb-6">
                  <Receipt className="h-10 w-10 text-muted-foreground opacity-20" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter">
                  No expenses found
                </h3>
                <p className="text-muted-foreground max-w-xs mt-2 text-sm">
                  {searchQuery
                    ? "No records match your search criteria."
                    : "You haven't recorded any expenses yet."}
                </p>
                {!searchQuery && (
                  <Button
                    variant="link"
                    onClick={handleOpenCreate}
                    className="mt-4 text-primary font-bold uppercase tracking-widest text-xs"
                  >
                    Create your first record
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b-2">
                      <th className="text-left p-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                        Expense
                      </th>
                      <th className="text-left p-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                        Staff
                      </th>
                      <th className="text-left p-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                        Date
                      </th>
                      <th className="text-right p-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                        Total
                      </th>
                      <th className="text-center p-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                        Status
                      </th>
                      <th className="text-right p-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-muted/10">
                    {filteredExpenses.map((expense) => (
                      <tr
                        key={expense._id}
                        className="group hover:bg-muted/5 transition-colors"
                      >
                        <td className="p-6">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 none-xl bg-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Wallet className="h-5 w-5 text-primary/60" />
                            </div>
                            <div>
                              <p className="font-black text-sm uppercase tracking-tight">
                                {expense.description}
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-0.5">
                                {expense.category}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 none-full bg-muted flex items-center justify-center text-[10px] font-black">
                              {expense.employeeId?.name?.[0] || "S"}
                            </div>
                            <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                              {expense.employeeId?.name || "Self"}
                            </span>
                          </div>
                        </td>
                        <td className="p-6">
                          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/60">
                            {new Date(expense.expenseDate).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </span>
                        </td>
                        <td className="p-6 text-right">
                          <span className="text-lg font-black text-primary tracking-tighter">
                            ₹ {expense.total?.toLocaleString()}
                          </span>
                        </td>
                        <td className="p-6 text-center">
                          <Badge
                            variant={
                              expense.status === "posted"
                                ? "default"
                                : "secondary"
                            }
                            className="none-full px-4 h-6 uppercase text-[9px] font-black tracking-widest border-2"
                          >
                            {expense.status}
                          </Badge>
                        </td>
                        <td className="p-6 text-right">
                          <div className="flex justify-end gap-1 opacity-10 md:opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 none-xl hover:bg-primary/10 hover:text-primary transition-all"
                              onClick={() => handleOpenView(expense)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 none-xl hover:bg-red-50 hover:text-red-500 transition-all"
                              onClick={() => handleDelete(expense._id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          formData?._id
            ? `Expense: ${formData.description}`
            : "Record New Expense"
        }
        className="max-w-[1400px]"
        footer={
          <div className="flex justify-between items-center w-full px-6 py-4 bg-muted/5 border-t">
            <div className="flex gap-2">
              {(formData?.status === "draft" || !formData?.status) && (
                <Button
                  variant="outline"
                  className="none-xl text-xs font-black tracking-widest uppercase border-2 hover:bg-primary hover:text-white transition-all px-6"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit("submitted")}
                >
                  <Send className="h-3.5 w-3.5 mr-2" /> Submit for Approval
                </Button>
              )}
              {formData?.status === "submitted" && (
                <>
                  <Button
                    variant="outline"
                    className="none-xl text-xs font-black tracking-widest uppercase border-2 hover:bg-red-500 hover:text-white transition-all px-6"
                    disabled={isSubmitting}
                    onClick={() => handleUpdateStatus("refused")}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-2" /> Refuse
                  </Button>
                  <Button
                    className="none-xl text-xs font-black tracking-widest uppercase border-2 bg-green-600 hover:bg-green-700 text-white transition-all px-6 border-green-700/20"
                    disabled={isSubmitting}
                    onClick={() => handleUpdateStatus("approved")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Approve
                  </Button>
                </>
              )}
              {formData?.status === "approved" && (
                <Button
                  className="none-xl text-xs font-black tracking-widest uppercase border-2 shadow-xl shadow-primary/20 px-6"
                  disabled={isSubmitting}
                  onClick={() => handleUpdateStatus("posted")}
                >
                  <Receipt className="h-3.5 w-3.5 mr-2" /> Post Journal Entry
                </Button>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setIsModalOpen(false)}
                className="font-bold underline text-xs uppercase"
              >
                {formData?.status === "posted" || formData?.status === "refused"
                  ? "Close"
                  : "Discard"}
              </Button>
              {(formData?.status === "draft" || !formData?.status) && (
                <Button
                  onClick={() => handleSubmit()}
                  disabled={isSubmitting}
                  className="none-xl font-black text-xs uppercase px-8 shadow-xl shadow-primary/20"
                >
                  {isSubmitting
                    ? "Processing..."
                    : formData?._id
                      ? "Update Draft"
                      : "Save Record"}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {formData && (
          <ExpensePopupContent
            formData={formData}
            setFormData={setFormData}
            isViewOnly={
              formData.status !== "draft" &&
              formData.status !== "approved" &&
              formData.status !== undefined
            }
          />
        )}
      </ModularModal>
    </DashboardLayout>
  );
}
