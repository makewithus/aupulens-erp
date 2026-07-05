"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { EmailTemplateEditorDialog } from "@/components/sales/subscriptions/EmailTemplateEditorDialog";
import { REMINDER_BASIS, REMINDER_DIRECTION } from "@/lib/constants/statuses";

function groupBy<T>(items: T[], key: (t: T) => string | undefined) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item) || "";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

export default function RemindersSettingsPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<"invoice" | "bill">("invoice");
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBasis, setNewBasis] = useState<string>(REMINDER_BASIS.DUE_DATE);
  const [newOffsetDays, setNewOffsetDays] = useState("0");
  const [newDirection, setNewDirection] = useState<string>(REMINDER_DIRECTION.AFTER);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/reminders?scope=${tab}`);
      const data = await res.json();
      if (data.success) setReminders(data.data);
    } catch {
      toast.error("Failed to load reminders");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (reminder: any) => {
    const res = await fetch(`/api/sales/reminders/${reminder._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !reminder.enabled }),
    });
    const data = await res.json();
    if (data.success) {
      setReminders((rs) => rs.map((r) => (r._id === reminder._id ? data.data : r)));
      toast.success(data.data.enabled ? "Reminder enabled" : "Reminder disabled");
    }
  };

  const deleteReminder = async (id: string) => {
    const res = await fetch(`/api/sales/reminders/${id}`, { method: "DELETE" });
    if (res.ok) {
      setReminders((rs) => rs.filter((r) => r._id !== id));
      toast.success("Reminder deleted");
    }
  };

  const createReminder = async () => {
    if (!newName.trim()) {
      toast.error("Reminder name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: tab,
          name: newName.trim(),
          basis: newBasis,
          offsetDays: Number(newOffsetDays) || 0,
          direction: newDirection,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to create reminder");
      setReminders((rs) => [...rs, data.data]);
      setNewOpen(false);
      setNewName("");
      toast.success("Reminder created");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const manual = reminders.filter((r) => r.type === "manual");
  const automated = reminders.filter((r) => r.type === "automated");
  const grouped = groupBy(automated, (r) => r.groupLabel);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Reminders"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Subscriptions", href: "/sales/subscriptions" },
        { label: "Reminders" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-xl font-bold">Reminders</h1>

        <div className="flex items-center gap-4 border-b">
          {(["invoice", "bill"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 px-1 text-sm font-medium capitalize ${
                tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-muted-foreground"
              }`}
            >
              {t === "invoice" ? "Invoices" : "Bills"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <>
            {manual.length > 0 && (
              <div>
                <h2 className="font-semibold mb-3">Manual Reminders</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manual.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.description}</TableCell>
                        <TableCell>
                          <button onClick={() => setEditingTemplate(r)}>
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div>
              <h2 className="font-semibold mb-3">Automated Reminders</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(grouped.entries()).map(([group, rows]) => (
                    <React.Fragment key={group}>
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={4} className="font-semibold text-xs uppercase tracking-wide">
                          {group}
                        </TableCell>
                      </TableRow>
                      {rows.map((r) => (
                        <TableRow key={r._id}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            Remind me {r.offsetDays} day(s) {r.direction === "before" ? "Before" : "After"}{" "}
                            {r.basis === "expected_payment_date" ? "expected payment date" : "due date"}
                          </TableCell>
                          <TableCell>
                            <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} />
                          </TableCell>
                          <TableCell className="flex items-center gap-2">
                            <button onClick={() => setEditingTemplate(r)}>
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </button>
                            {!r.isSystem && (
                              <button onClick={() => deleteReminder(r._id)}>
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setNewOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Reminder
              </Button>
            </div>
          </>
        )}
      </div>

      {editingTemplate && (
        <EmailTemplateEditorDialog
          open={!!editingTemplate}
          onOpenChange={(open) => !open && setEditingTemplate(null)}
          templateKey={`reminder:${editingTemplate._id}`}
          title={`Edit Template — ${editingTemplate.name}`}
          defaultName={editingTemplate.name}
        />
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <h2 className="text-lg font-semibold mb-4">New Reminder</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Based On</Label>
              <Select value={newBasis} onValueChange={setNewBasis}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={REMINDER_BASIS.DUE_DATE}>Due Date</SelectItem>
                  <SelectItem value={REMINDER_BASIS.EXPECTED_PAYMENT_DATE}>Expected Payment Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Offset (days)</Label>
                <Input type="number" min={0} value={newOffsetDays} onChange={(e) => setNewOffsetDays(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select value={newDirection} onValueChange={setNewDirection}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={REMINDER_DIRECTION.BEFORE}>Before</SelectItem>
                    <SelectItem value={REMINDER_DIRECTION.AFTER}>After</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={createReminder} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
