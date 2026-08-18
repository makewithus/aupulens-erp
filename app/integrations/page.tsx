"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { toast } from "sonner";
import {
  Plug,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Copy,
  Trash2,
  Power,
  Activity,
} from "lucide-react";

/**
 * Aupulens Connect (vNext Expansion Module 2) — the iPaaS console.
 * Browse connectors, configure a connection (credentials encrypted at rest),
 * test it, copy the signed inbound webhook URL, toggle it, and watch a live
 * health feed. All operations tenant-scoped server-side by /api/integrations/*.
 */

interface CredField { key: string; label: string; secret: boolean; placeholder?: string }
interface Connector {
  id: string; name: string; category: string; blurb: string; authType: string;
  credentials: CredField[]; hasWebhook: boolean; capabilities: string[]; docsUrl?: string;
}
interface Connection {
  _id: string; connectorId: string; connectorName: string; name: string;
  status: string; enabled: boolean; credentialsSet: Record<string, boolean>;
  hasWebhook: boolean; webhookUrl: string | null; lastTestAt?: string; lastEventAt?: string; lastError?: string;
}
interface EventRow {
  _id: string; connectorId: string; direction: string; eventType: string; status: string; message?: string; createdAt: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  connected: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
  disconnected: <Circle className="h-4 w-4 text-muted-foreground" />,
};

export default function IntegrationsPage() {
  const { data: session, status } = useSession();
  const [catalog, setCatalog] = useState<Connector[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [summary, setSummary] = useState({ success: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState<Connector | null>(null);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, conn, ev] = await Promise.all([
        fetch("/api/integrations/connectors").then((r) => r.json()),
        fetch("/api/integrations/connections").then((r) => r.json()),
        fetch("/api/integrations/events?limit=25").then((r) => r.json()),
      ]);
      if (cat.success) setCatalog(cat.data);
      if (conn.success) setConnections(conn.data);
      if (ev.success) { setEvents(ev.data.events); setSummary(ev.data.summary); }
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startAdd = (c: Connector) => { setAdding(c); setCreds({}); setName(c.name); };

  const createConnection = async () => {
    if (!adding) return;
    setBusy("create");
    try {
      const res = await fetch("/api/integrations/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: adding.id, name, credentials: creds }),
      });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || "Failed");
      toast.success(`${adding.name} connection created`);
      setAdding(null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: "test" | "toggle", label: string) => {
    setBusy(id + action);
    try {
      const res = await fetch(`/api/integrations/connections/${id}/${action}`, { method: "POST" });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || `${label} failed`);
      if (action === "test") { if (json.data.ok) toast.success(json.data.message); else toast.error(json.data.message); }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this connection and its event history?")) return;
    const res = await fetch(`/api/integrations/connections/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) return toast.error("Delete failed");
    await load();
  };

  const copy = (url: string) => { navigator.clipboard.writeText(url); toast.success("Webhook URL copied"); };

  if (status === "loading") return <AuthSplash />;

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      dashboardTitle="Admin"
      pageName="Aupulens Connect"
      breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Aupulens Connect" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={(session?.user as any)?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      onRefresh={load}
    >
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Plug className="h-6 w-6 text-sky-500" /> Aupulens Connect
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect payments, messaging and commerce systems. Credentials are encrypted at rest; inbound webhooks are HMAC-verified.
        </p>
      </div>

      {/* Health summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Connections" value={connections.length} />
        <Stat label="Connected" value={connections.filter((c) => c.status === "connected").length} tone="emerald" />
        <Stat label="Events (24h) ✓" value={summary.success} tone="emerald" />
        <Stat label="Events (24h) ✗" value={summary.failed} tone="red" />
      </div>

      {/* My connections */}
      <section className="mb-8">
        <h2 className="font-semibold mb-3">Your connections</h2>
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No connections yet. Add one from the catalog below.</p>
        ) : (
          <div className="space-y-3">
            {connections.map((c) => (
              <div key={c._id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {STATUS_ICON[c.status]} {c.name}
                      <span className="text-xs text-muted-foreground">({c.connectorName})</span>
                      {!c.enabled && <span className="text-xs rounded bg-muted px-1.5 py-0.5">disabled</span>}
                    </div>
                    {c.lastError && <p className="text-xs text-red-500 mt-1">{c.lastError}</p>}
                    {c.webhookUrl && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <code className="truncate max-w-md rounded bg-muted px-2 py-1">{c.webhookUrl}</code>
                        <button onClick={() => copy(c.webhookUrl!)} className="text-muted-foreground hover:text-foreground" title="Copy webhook URL"><Copy className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => act(c._id, "test", "Test")} disabled={!!busy} className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-accent disabled:opacity-50">
                      {busy === c._id + "test" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />} Test
                    </button>
                    <button onClick={() => act(c._id, "toggle", "Toggle")} disabled={!!busy} className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-accent disabled:opacity-50" title="Enable/disable">
                      <Power className="h-3 w-3" />
                    </button>
                    <button onClick={() => del(c._id)} className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-accent text-red-500" title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Catalog */}
      <section className="mb-8">
        <h2 className="font-semibold mb-3">Connector catalog</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.category}</span>
              </div>
              <p className="text-xs text-muted-foreground flex-1">{c.blurb}</p>
              <button onClick={() => startAdd(c)} className="mt-1 inline-flex items-center justify-center gap-1 rounded-md bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 text-sm font-medium">
                Connect
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Activity feed */}
      <section>
        <h2 className="font-semibold mb-3">Recent activity</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet. Test a connection or send a webhook.</p>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {events.map((e) => (
              <div key={e._id} className="flex items-center gap-3 px-4 py-2 text-sm">
                {e.status === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span className="font-mono text-xs w-20 shrink-0">{e.connectorId}</span>
                <span className="text-xs w-16 shrink-0 text-muted-foreground">{e.direction}</span>
                <span className="flex-1 truncate">{e.eventType}{e.message ? ` — ${e.message}` : ""}</span>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add-connection modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAdding(null)}>
          <div className="w-full max-w-md rounded-xl border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Connect {adding.name}</h3>
            <p className="text-xs text-muted-foreground mb-4">{adding.blurb}</p>
            <label className="block text-xs font-medium mb-1">Connection name</label>
            <input className="w-full border rounded-md px-3 py-2 bg-background text-sm mb-3" value={name} onChange={(e) => setName(e.target.value)} />
            {adding.credentials.map((f) => (
              <div key={f.key} className="mb-3">
                <label className="block text-xs font-medium mb-1">{f.label}{f.secret && <span className="text-muted-foreground"> (encrypted)</span>}</label>
                <input
                  type={f.secret ? "password" : "text"}
                  placeholder={f.placeholder}
                  className="w-full border rounded-md px-3 py-2 bg-background text-sm"
                  value={creds[f.key] ?? ""}
                  onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAdding(null)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">Cancel</button>
              <button onClick={createConnection} disabled={busy === "create"} className="inline-flex items-center gap-1 rounded-md bg-sky-600 hover:bg-sky-700 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50">
                {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "red" }) {
  const color = tone === "emerald" ? "text-emerald-500" : tone === "red" ? "text-red-500" : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
