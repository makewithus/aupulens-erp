"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { AccountingSubNav } from "@/components/finance/accounting/AccountingSubNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, X } from "lucide-react";
import { AccountPicker, type PickerAccount } from "@/components/finance/accounting/AccountPicker";

interface Line {
  id: number;
  accountId: string;
  description: string;
  contactId: string;
  type: "debit" | "credit";
}

const REPORTING_METHODS = [
  { value: "accrual_and_cash", label: "Accrual and Cash" },
  { value: "accrual_only", label: "Accrual Only" },
  { value: "cash_only", label: "Cash Only" },
];

export default function NewJournalTemplatePage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [accounts, setAccounts] = useState<PickerAccount[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [reportingMethod, setReportingMethod] = useState("accrual_and_cash");
  const [lines, setLines] = useState<Line[]>([{ id: 1, accountId: "", description: "", contactId: "", type: "debit" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/finance/accounting/accounts?view=active")
      .then((r) => r.json())
      .then((d) => setAccounts((d.accounts || []).map((a: any) => ({ _id: a._id, accountName: a.accountName, accountCode: a.accountCode }))))
      .catch(() => {});
    fetch("/api/sales/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.items || []))
      .catch(() => {});
  }, []);

  const updateLine = (id: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, { id: Date.now(), accountId: "", description: "", contactId: "", type: "debit" }]);
  const removeLine = (id: number) => lines.length > 1 && setLines(lines.filter((l) => l.id !== id));

  const handleSave = async () => {
    if (!templateName.trim()) return toast.error("Template Name is required");
    if (!notes.trim()) return toast.error("Notes is required");
    const validLines = lines.filter((l) => l.accountId);
    if (validLines.length === 0) return toast.error("At least one line with an account is required");

    setSaving(true);
    try {
      const res = await fetch("/api/finance/accounting/journal-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName,
          referenceNumber,
          notes,
          reportingMethod,
          currency: "INR",
          lines: validLines.map((l) => ({ accountId: l.accountId, description: l.description, contactId: l.contactId || undefined, type: l.type })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save template");
      toast.success("Template created");
      router.push("/finance/accounting/journals/templates");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="New Template"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Journal Templates", href: "/finance/accounting/journals/templates" },
        { label: "New Template" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <AccountingSubNav />

        <div className="bg-card text-card-foreground p-8 rounded-lg shadow-sm border">
          <div className="flex justify-between items-center mb-8 pb-4 border-b border-border">
            <h2 className="text-2xl font-semibold tracking-tight">New Template</h2>
            <Button variant="ghost" size="icon" onClick={() => router.push("/finance/accounting/journals/templates")}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-[200px_1fr] gap-y-6 items-start max-w-3xl">
            <label className="text-sm font-medium text-red-500 pt-2">Template Name*</label>
            <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="max-w-[400px]" />

            <label className="text-sm font-medium text-muted-foreground pt-2">Reference#</label>
            <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="max-w-[400px]" />

            <label className="text-sm font-medium text-red-500 pt-2">Notes*</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Max. 500 characters"
              maxLength={500}
              className="max-w-[400px] h-24 resize-none"
            />

            <label className="text-sm font-medium text-muted-foreground pt-2">
              Reporting Method <span className="text-muted-foreground opacity-70">ⓘ</span>
            </label>
            <div className="flex items-center space-x-6 pt-2">
              {REPORTING_METHODS.map((m) => (
                <label key={m.value} className="flex items-center space-x-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="reporting_tpl"
                    className="accent-primary"
                    checked={reportingMethod === m.value}
                    onChange={() => setReportingMethod(m.value)}
                  />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>

            <label className="text-sm font-medium text-muted-foreground pt-2">Currency</label>
            <Select defaultValue="inr">
              <SelectTrigger className="max-w-[400px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inr">INR - Indian Rupee</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-12">
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b text-muted-foreground text-xs tracking-wider">
                  <tr>
                    <th className="py-3 px-4 font-medium w-8"></th>
                    <th className="py-3 px-4 text-left font-medium w-[25%] border-r">ACCOUNT</th>
                    <th className="py-3 px-4 text-left font-medium w-[25%] border-r">DESCRIPTION</th>
                    <th className="py-3 px-4 text-left font-medium w-[20%] border-r">CONTACT (INR)</th>
                    <th className="py-3 px-4 text-left font-medium">TYPE</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-b group bg-card hover:bg-muted/50 transition-colors">
                      <td className="p-2 text-center text-muted-foreground cursor-pointer" onClick={() => removeLine(line.id)}>
                        <Trash2 className="h-3.5 w-3.5 inline" />
                      </td>
                      <td className="p-2 border-r">
                        <AccountPicker
                          accounts={accounts}
                          value={line.accountId}
                          onChange={(v) => updateLine(line.id, { accountId: v })}
                          placeholder="Select an account"
                          className="border-0 shadow-none h-9"
                        />
                      </td>
                      <td className="p-0 border-r">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          placeholder="Description"
                          className="border-0 shadow-none focus-visible:ring-0 rounded-none h-10 px-3 bg-transparent"
                        />
                      </td>
                      <td className="p-0 border-r">
                        <Select value={line.contactId || "none"} onValueChange={(v) => updateLine(line.id, { contactId: v === "none" ? "" : v })}>
                          <SelectTrigger className="border-0 shadow-none focus:ring-0 rounded-none h-10 px-3 bg-transparent">
                            <SelectValue placeholder="Select Contact" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {customers.map((c) => (
                              <SelectItem key={c._id} value={c._id}>
                                {c.header?.name || c.name || "Unnamed"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-0">
                        <Select value={line.type} onValueChange={(v: "debit" | "credit") => updateLine(line.id, { type: v })}>
                          <SelectTrigger className="border-0 shadow-none focus:ring-0 rounded-none h-10 px-3 bg-transparent">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="debit">Debit</SelectItem>
                            <SelectItem value="credit">Credit</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6">
              <Button variant="ghost" className="text-primary hover:text-primary hover:bg-primary/10 font-medium px-2" onClick={addLine}>
                <div className="bg-primary/20 rounded-full p-0.5 mr-2">
                  <Plus className="h-4 w-4" />
                </div>
                Add New Row
              </Button>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-border flex space-x-3 bg-muted/50 -mx-8 -mb-8 px-8 py-4 rounded-b-lg">
            <Button className="font-medium px-6" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="outline"
              className="font-medium px-6 bg-background"
              onClick={() => router.push("/finance/accounting/journals/templates")}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
