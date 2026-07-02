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

export default function BankingRulesPage() {
  const { data: session } = useSession();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/accounting/banking-rules");
      const data = await res.json();
      if (data.success) setRules(data.data);
      else toast.error(data.message || "Failed to load rules");
    } catch {
      toast.error("Failed to load rules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ title: "Delete rule?", description: "This banking rule will be permanently removed." });
    if (!ok) return;
    const res = await fetch(`/api/finance/accounting/banking-rules/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      toast.success("Rule deleted");
      fetchRules();
    } else toast.error(data.message || "Failed to delete rule");
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Banking Rules"
      breadcrumbs={[{ label: "Finance", href: "/finance/summary" }, { label: "Accounting" }, { label: "Banking Rules" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <AccountingSubNav />

        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Banking Rules</h1>
          <Link href="/finance/accounting/banking/rules/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" /> New Rule
            </Button>
          </Link>
        </div>

        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RULE NAME</TableHead>
                <TableHead>APPLY TO</TableHead>
                <TableHead>RECORD AS</TableHead>
                <TableHead>ACCOUNT</TableHead>
                <TableHead>STATUS</TableHead>
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
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No banking rules yet. Create one to auto-categorise transactions.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="font-medium">{r.ruleName}</TableCell>
                    <TableCell className="capitalize">{r.applyTo}</TableCell>
                    <TableCell className="capitalize">{r.recordAs?.replace(/_/g, " ")}</TableCell>
                    <TableCell>{r.accountId?.accountName || "-"}</TableCell>
                    <TableCell className="capitalize">{r.status}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/finance/accounting/banking/rules/${r._id}/edit`}>Edit</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(r._id)}>
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
