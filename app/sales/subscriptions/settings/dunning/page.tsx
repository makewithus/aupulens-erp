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
import { Mail, Plus } from "lucide-react";

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
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Dunning Rules</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/sales/subscriptions/settings/email-notifications"
              className="text-sm text-blue-600 underline flex items-center gap-1"
            >
              <Mail className="w-4 h-4" /> Configure email templates
            </Link>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => router.push("/sales/subscriptions/settings/dunning/new")}
            >
              <Plus className="w-4 h-4 mr-1" /> New Rule
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">S.NO</TableHead>
                <TableHead>Rule Name</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r, i) => (
                <TableRow key={r._id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <Link
                      href={`/sales/subscriptions/settings/dunning/${r._id}`}
                      className="text-blue-600 underline font-medium"
                    >
                      {r.name}
                    </Link>
                    {r.isDefault && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 border rounded-none bg-muted/50">Default</span>
                    )}
                  </TableCell>
                  <TableCell className="capitalize">{r.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </DashboardLayout>
  );
}
