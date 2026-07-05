"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil } from "lucide-react";
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
        <h1 className="text-xl font-bold">Email Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Choose which subscription lifecycle events send an email to the customer, and customize each template.
        </p>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Notification Type</TableHead>
                <TableHead className="w-24">Enabled</TableHead>
                <TableHead className="w-20">Template</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map((s) => (
                <TableRow key={s.eventKey}>
                  <TableCell className="font-medium">{s.label}</TableCell>
                  <TableCell>
                    <Switch checked={s.enabled} onCheckedChange={() => toggle(s)} />
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setEditing(s)}>
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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
