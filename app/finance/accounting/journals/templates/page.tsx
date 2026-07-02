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

export default function JournalTemplatesPage() {
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/accounting/journal-templates");
      const data = await res.json();
      if (data.success) setTemplates(data.data);
      else toast.error(data.message || "Failed to load templates");
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ title: "Delete template?", description: "This journal template will be permanently removed." });
    if (!ok) return;
    const res = await fetch(`/api/finance/accounting/journal-templates/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      toast.success("Template deleted");
      fetchTemplates();
    } else toast.error(data.message);
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Journal Templates"
      breadcrumbs={[{ label: "Finance", href: "/finance/summary" }, { label: "Accounting" }, { label: "Journal Templates" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <AccountingSubNav />

        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Journal Templates</h1>
          <Link href="/finance/accounting/journals/templates/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" /> New Template
            </Button>
          </Link>
        </div>

        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>TEMPLATE NAME</TableHead>
                <TableHead>REFERENCE#</TableHead>
                <TableHead>REPORTING METHOD</TableHead>
                <TableHead>LINES</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No journal templates yet.
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="font-medium">{t.templateName}</TableCell>
                    <TableCell>{t.referenceNumber || "-"}</TableCell>
                    <TableCell className="capitalize">{t.reportingMethod?.replace(/_/g, " ")}</TableCell>
                    <TableCell>{t.lines?.length || 0}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/finance/accounting/chart-of-accounts?tab=Journals`}>Use in Journal</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(t._id)}>
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
