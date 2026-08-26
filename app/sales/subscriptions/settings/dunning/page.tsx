"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, Plus, Loader2 } from "lucide-react";

export default function DunningRulesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales/dunning-rules");
      const data = await res.json();
      if (data.success) setRules(data.data);
    } catch {
      toast.error("Failed to load dunning rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Dunning Rules"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Subscriptions", href: "/sales/subscriptions" },
        { label: "Dunning Management" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">Dunning Rules</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/sales/subscriptions/settings/email-notifications"
              className="font-mono text-[11px] uppercase tracking-wider text-primary underline flex items-center gap-1"
            >
              <Mail className="w-4 h-4" /> Configure email templates
            </Link>
            <Button
              className="font-mono text-[11px] uppercase tracking-wider"
              onClick={() => router.push("/sales/subscriptions/settings/dunning/new")}
            >
              <Plus className="w-4 h-4 mr-1" /> New Rule
            </Button>
          </div>
        </div>

        <Table>
            <TableHeader className="border-border/40">
              <TableRow>
                <TableHead className="w-16 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50">S.No</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50">Rule Name</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-16">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r, i) => (
                  <TableRow key={r._id} className="group transition-colors duration-300 hover:bg-white/[0.015]">
                    <TableCell className="text-sm text-foreground/80">{i + 1}</TableCell>
                    <TableCell>
                      <Link
                        href={`/sales/subscriptions/settings/dunning/${r._id}`}
                        className="text-primary underline font-medium"
                      >
                        {r.name}
                      </Link>
                      {r.isDefault && (
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-border/40 rounded-none bg-accent">Default</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground/80 capitalize">{r.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
      </div>
    </DashboardLayout>
  );
}
