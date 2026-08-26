"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Loader2 } from "lucide-react";
import { EmailTemplateEditorDialog } from "@/components/sales/subscriptions/EmailTemplateEditorDialog";

export default function EmailNotificationsSettingsPage() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales/subscription-notifications");
      const data = await res.json();
      if (data.success) setSettings(data.data);
    } catch {
      toast.error("Failed to load notification settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (setting: any) => {
    const res = await fetch("/api/sales/subscription-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventKey: setting.eventKey, enabled: !setting.enabled }),
    });
    const data = await res.json();
    if (data.success) setSettings((s) => s.map((x) => (x.eventKey === setting.eventKey ? data.data : x)));
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Email Notifications"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Subscriptions", href: "/sales/subscriptions" },
        { label: "Email Notifications" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">Email Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Choose which subscription lifecycle events send an email to the customer, and customize each template.
        </p>

        <Table>
          <TableHeader className="border-border/40">
            <TableRow>
              <TableHead className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/50">Notification Type</TableHead>
              <TableHead className="w-24 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/50">Enabled</TableHead>
              <TableHead className="w-20 font-mono text-[11px] uppercase tracking-widest text-muted-foreground/50">Template</TableHead>
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
              settings.map((s) => (
                <TableRow key={s.eventKey} className="group transition-colors duration-300 hover:bg-white/[0.015]">
                  <TableCell className="font-medium text-foreground/80">{s.label}</TableCell>
                  <TableCell>
                    <Switch checked={s.enabled} onCheckedChange={() => toggle(s)} />
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setEditing(s)}>
                      <Pencil className="w-4 h-4 text-muted-foreground hover:text-primary" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <EmailTemplateEditorDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          templateKey={`notification:${editing.eventKey}`}
          title={`Edit Template — ${editing.label}`}
          defaultName={editing.label}
          defaultSubject={editing.label}
        />
      )}
    </DashboardLayout>
  );
}
