"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { AccountingSubNav } from "@/components/finance/accounting/AccountingSubNav";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { confirmDialog } from "@/components/providers/ConfirmRoot";

export default function BudgetsPage() {
  const { data: session } = useSession();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/accounting/budgets");
      const data = await res.json();
      if (data.success) setBudgets(data.data);
      else toast.error(data.message || "Failed to load budgets");
    } catch {
      toast.error("Failed to load budgets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, []);

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ title: "Delete budget?", description: "This budget will be permanently removed." });
    if (!ok) return;
    const res = await fetch(`/api/finance/accounting/budgets/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      toast.success("Budget deleted");
      fetchBudgets();
    } else toast.error(data.message || "Failed to delete budget");
  };

  const totalOf = (budget: any) =>
    (budget.lines || []).reduce(
      (sum: number, line: any) => sum + (line.amounts || []).reduce((s: number, a: any) => s + (a.amount || 0), 0),
      0,
    );

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Budgets"
      breadcrumbs={[{ label: "Finance", href: "/finance/summary" }, { label: "Accounting" }, { label: "Budgets" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <AccountingSubNav />

        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Budgets</h1>
          <Link href="/finance/accounting/budgets/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" /> New Budget
            </Button>
          </Link>
        </div>

        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NAME</TableHead>
                <TableHead>FISCAL YEAR</TableHead>
                <TableHead>PERIOD</TableHead>
                <TableHead>ACCOUNTS</TableHead>
                <TableHead>TOTAL BUDGETED</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : budgets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No budgets yet. Create one to track budget vs actuals.
                  </TableCell>
                </TableRow>
              ) : (
                budgets.map((b) => (
                  <TableRow key={b._id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>{b.fiscalYear}</TableCell>
                    <TableCell className="capitalize">{b.period}</TableCell>
                    <TableCell>{b.lines?.length || 0}</TableCell>
                    <TableCell>
                      {totalOf(b).toLocaleString(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/finance/accounting/budgets/${b._id}/edit`}>Edit</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(b._id)}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
