"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Store, Download, Loader2, Workflow, ShieldCheck, Palette } from "lucide-react";

/**
 * Marketplace (6.12) — browse and install shareable configuration packages
 * (workflows, approval policies, print formats) published by any workspace.
 * Installing creates fresh, tenant-owned records in your workspace.
 */
const CATEGORY_META: Record<string, { label: string; icon: any; color: string }> = {
  workflow: { label: "Workflow", icon: Workflow, color: "text-purple-400" },
  "approval-policy": { label: "Approval policy", icon: ShieldCheck, color: "text-emerald-400" },
  "print-format": { label: "Print format", icon: Palette, color: "text-indigo-400" },
};

export default function MarketplacePage() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [installing, setInstalling] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(`/api/marketplace${filter ? `?category=${filter}` : ""}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setPackages(d.data); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(load, [filter]);

  const install = async (id: string) => {
    setInstalling(id);
    try {
      const res = await fetch(`/api/marketplace/${id}/install`, { method: "POST" });
      const d = await res.json();
      if (d.success) { toast.success(d.data.message); load(); }
      else toast.error(d.message || "Install failed");
    } finally { setInstalling(null); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="h-6 w-6 text-indigo-500" /> Marketplace</h1>
        <p className="text-sm text-muted-foreground mt-1">Install ready-made workflows, approval policies, and print formats.</p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {["", "workflow", "approval-policy", "print-format"].map((c) => (
          <button key={c || "all"} onClick={() => setFilter(c)} className={`text-xs rounded-full px-3 py-1.5 border ${filter === c ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
            {c ? CATEGORY_META[c].label : "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : packages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No packages published yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {packages.map((p) => {
            const meta = CATEGORY_META[p.category] || CATEGORY_META.workflow;
            const Icon = meta.icon;
            return (
              <div key={p._id} className="border-2 rounded-xl p-4 flex flex-col">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                    <div>
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{meta.label} · by {p.publisherName}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{p.installCount} installs</span>
                </div>
                {p.description && <p className="text-xs text-muted-foreground mt-2 flex-1">{p.description}</p>}
                <button onClick={() => install(p._id)} disabled={installing === p._id} className="mt-3 bg-primary text-primary-foreground rounded-md py-1.5 text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
                  {installing === p._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Install
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
