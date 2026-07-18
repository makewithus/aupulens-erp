"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { toast } from "sonner";
import { FileWarning, Printer, Scale } from "lucide-react";

type TrialBalanceAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  internalGroup: string;
  debit: number;
  credit: number;
  debitBalance: number;
  creditBalance: number;
};

type TrialBalanceResponse = {
  accounts: TrialBalanceAccount[];
  totals: {
    debit: number;
    credit: number;
    debitBalance: number;
    creditBalance: number;
  };
  validation: {
    postedJournalBalanced: boolean;
    trialBalanceBalanced: boolean;
  };
};

function formatCurrency(value?: number) {
  return `INR ${(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

export default function TrialBalancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<TrialBalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<
    { from: Date; to: Date } | undefined
  >(undefined);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateRange?.from && dateRange?.to) {
        params.set("startDate", dateRange.from.toISOString());
        params.set("endDate", dateRange.to.toISOString());
      }

      const query = params.toString();
      const res = await fetch(
        `/api/finance/reports/trial-balance${query ? `?${query}` : ""}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load trial balance");
      setData(json);
    } catch (error: any) {
      toast.error(error.message || "Failed to load trial balance");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/finance");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handlePrint = () => {
    window.print();
  };

  const balanced =
    data?.validation.postedJournalBalanced &&
    data?.validation.trialBalanceBalanced;

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Trial Balance"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Trial Balance" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "finance"}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Trial Balance
            </h1>
            <p className="text-sm text-muted-foreground">
              Debit and credit balances from posted journal entries
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker onUpdate={(range) => setDateRange(range)} />
            <Button variant="outline" onClick={handlePrint} disabled={loading}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-full bg-primary/10 p-3">
                <Scale className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Status
                </p>
                <Badge variant={balanced ? "default" : "destructive"}>
                  {balanced ? "Balanced" : "Out of Balance"}
                </Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Debit Balance
              </p>
              <p className="mt-2 text-2xl font-black">
                {formatCurrency(data?.totals.debitBalance)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Credit Balance
              </p>
              <p className="mt-2 text-2xl font-black">
                {formatCurrency(data?.totals.creditBalance)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-none bg-transparent shadow-none">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !data || data.accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-background py-20">
                <FileWarning className="mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground">
                  No posted journal balances found
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-background">
                <Table className="min-w-full divide-y divide-border">
                  <TableHeader className="bg-muted/50">
                    <TableRow className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <TableHead className="px-6 py-4 text-left">Account</TableHead>
                      <TableHead className="px-6 py-4 text-left">Group</TableHead>
                      <TableHead className="px-6 py-4 text-right">Debits</TableHead>
                      <TableHead className="px-6 py-4 text-right">Credits</TableHead>
                      <TableHead className="px-6 py-4 text-right">Debit Balance</TableHead>
                      <TableHead className="px-6 py-4 text-right">Credit Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {data.accounts.map((account) => (
                      <TableRow
                        key={account.id}
                        className="text-sm transition-colors hover:bg-muted/20"
                      >
                        <TableCell className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-semibold">{account.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {account.code}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 capitalize text-muted-foreground">
                          {account.internalGroup.replace("_", " ")}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right">
                          {formatCurrency(account.debit)}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right">
                          {formatCurrency(account.credit)}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-semibold">
                          {account.debitBalance
                            ? formatCurrency(account.debitBalance)
                            : "-"}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right font-semibold">
                          {account.creditBalance
                            ? formatCurrency(account.creditBalance)
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="border-t-2 bg-muted/50 font-black">
                    <TableRow>
                      <TableCell
                        colSpan={2}
                        className="px-6 py-4 text-right text-xs uppercase tracking-widest"
                      >
                        Totals
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        {formatCurrency(data.totals.debit)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        {formatCurrency(data.totals.credit)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        {formatCurrency(data.totals.debitBalance)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        {formatCurrency(data.totals.creditBalance)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
