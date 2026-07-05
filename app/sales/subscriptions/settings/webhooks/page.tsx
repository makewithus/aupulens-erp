"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { SUBSCRIPTION_WEBHOOK_EVENT } from "@/lib/constants/statuses";

const EVENT_OPTIONS = Object.values(SUBSCRIPTION_WEBHOOK_EVENT);

export default function WebhooksSettingsPage() {
  const { data: session } = useSession();
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales/subscription-webhooks");
      const data = await res.json();
      if (data.success) setWebhooks(data.data);
    } catch {
      toast.error("Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleEvent = (evt: string) =>
    setEvents((e) => (e.includes(evt) ? e.filter((x) => x !== evt) : [...e, evt]));

  const toggleActive = async (webhook: any) => {
    const res = await fetch(`/api/sales/subscription-webhooks/${webhook._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !webhook.active }),
    });
    const data = await res.json();
    if (data.success) setWebhooks((ws) => ws.map((w) => (w._id === webhook._id ? data.data : w)));
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/sales/subscription-webhooks/${id}`, { method: "DELETE" });
    if (res.ok) {
      setWebhooks((ws) => ws.filter((w) => w._id !== id));
      toast.success("Webhook deleted");
    }
  };

  const create = async () => {
    if (!name.trim() || !url.trim()) {
      toast.error("Name and URL are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales/subscription-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, events }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to create webhook");
      setWebhooks((ws) => [data.data, ...ws]);
      setNewOpen(false);
      setName("");
      setUrl("");
      setEvents([]);
      toast.success("Webhook created");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Webhooks"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Subscriptions", href: "/sales/subscriptions" },
        { label: "Webhooks" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Webhooks</h1>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Webhook
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Aupulens will POST a signed JSON payload to your URL whenever a subscribed event occurs.
        </p>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : webhooks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No webhooks configured yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead className="w-20">Active</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((w) => (
                <TableRow key={w._id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{w.url}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{w.events.join(", ")}</TableCell>
                  <TableCell>
                    <Switch checked={w.active} onCheckedChange={() => toggleActive(w)} />
                  </TableCell>
                  <TableCell>
                    <button onClick={() => remove(w._id)}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <h2 className="text-lg font-semibold mb-4">New Webhook</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" />
            </div>
            <div className="space-y-1.5">
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {EVENT_OPTIONS.map((evt) => (
                  <label key={evt} className="flex items-center gap-2 text-sm capitalize">
                    <Checkbox checked={events.includes(evt)} onCheckedChange={() => toggleEvent(evt)} />
                    {evt.replace(/_/g, " ")}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={create} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
