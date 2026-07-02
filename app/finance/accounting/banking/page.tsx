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
import { Landmark, CreditCard, Shuffle, ArrowRight } from "lucide-react";

export default function BankingLandingPage() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [rulesCount, setRulesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/finance/accounting/accounts?view=active").then((r) => r.json()),
      fetch("/api/finance/accounting/banking-rules").then((r) => r.json()),
    ])
      .then(([accData, ruleData]) => {
        const bankLike = (accData.accounts || []).filter((a: any) =>
          ["Bank", "Credit Card", "Cash"].includes(a.accountType?.name),
        );
        setAccounts(bankLike);
        if (ruleData.success) setRulesCount(ruleData.data.length);
      })
      .catch(() => toast.error("Failed to load banking data"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Banking"
      breadcrumbs={[{ label: "Finance", href: "/finance/summary" }, { label: "Accounting" }, { label: "Banking" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <AccountingSubNav />

        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Banking</h1>
          <Link href="/finance/accounting/banking/rules">
            <Button variant="outline">
              <Shuffle className="h-4 w-4 mr-2" /> Manage Banking Rules ({rulesCount})
            </Button>
          </Link>
        </div>

        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>ACCOUNT NAME</TableHead>
                <TableHead>ACCOUNT CODE</TableHead>
                <TableHead>TYPE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No bank, card, or cash accounts found. Add one from Chart of Accounts.
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>
                      {a.accountType?.name === "Credit Card" ? (
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-blue-600 dark:text-blue-400">{a.accountName}</TableCell>
                    <TableCell>{a.accountCode || "-"}</TableCell>
                    <TableCell>{a.accountType?.name || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Link
          href="/finance/accounting/banking/rules/new"
          className="flex items-center justify-between rounded-lg border p-4 bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
        >
          <span>Automatically categorise deposits and withdrawals with Banking Rules.</span>
          <span className="text-primary font-medium flex items-center">
            Create a rule <ArrowRight className="h-4 w-4 ml-1" />
          </span>
        </Link>
      </div>
    </DashboardLayout>
  );
}
