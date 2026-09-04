"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  Bell,
  FolderClosed,
  ShieldCheck,
  Clock,
  CircleAlert,
  CheckCircle2,
  Ban,
  MinusCircle,
  FileText,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { AI_WORKFLOW_LABELS } from "@/lib/aiRuntime/workflows/catalog";
import { AI_AUTONOMY_LEVEL_ORDER } from "@/lib/constants/statuses";

const ORG_ADMIN_ROLES = ["admin", "master-admin"];

const PRIORITY_STYLE: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/30",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  low: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  info: "bg-muted text-muted-foreground border-border/30",
};

const DOMAIN_STATUS_STYLE: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  blocked: "bg-red-500/10 text-red-500 border-red-500/30",
  at_risk: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  not_applicable: "bg-muted/40 text-muted-foreground/50 border-border/20 border-dashed",
  not_checked: "bg-muted/10 text-muted-foreground/40 border-border/20 border-dashed italic",
};

const DOMAIN_STATUS_ICON: Record<string, any> = {
  ready: CheckCircle2,
  blocked: CircleAlert,
  at_risk: CircleAlert,
  not_applicable: Ban,
  not_checked: MinusCircle,
};

const SEVERITY_RANK: Record<string, number> = {
  hard_blocker: 0,
  material_exception: 1,
  minor_exception: 2,
  stale: 3,
  unclassified: 4,
};

const SEVERITY_STYLE: Record<string, string> = {
  hard_blocker: "bg-red-500/10 text-red-500 border-red-500/30",
  material_exception: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  minor_exception: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  stale: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  unclassified: "bg-muted text-muted-foreground border-border/30",
};

const RECON_STATUS_STYLE: Record<string, string> = {
  reconciled: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  unreconciled: "bg-red-500/10 text-red-500 border-red-500/30",
  not_applicable: "bg-muted/40 text-muted-foreground/50 border-border/20 border-dashed",
  not_implemented: "bg-muted/10 text-muted-foreground/40 border-border/20 border-dashed italic",
  not_covered: "bg-muted/10 text-muted-foreground/30 border-border/20 border-dashed italic",
};

const EVIDENCE_STATUS_STYLE: Record<string, string> = {
  verified: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  unverified: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  not_checked: "bg-muted/10 text-muted-foreground/40 border-border/20 border-dashed italic",
  not_applicable: "bg-muted/40 text-muted-foreground/50 border-border/20 border-dashed",
  not_covered: "bg-muted/10 text-muted-foreground/30 border-border/20 border-dashed italic",
};

const MATERIALITY_STYLE: Record<string, string> = {
  material: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  immaterial: "bg-muted/40 text-muted-foreground/50 border-border/20",
  unclassified: "bg-muted/10 text-muted-foreground/40 border-border/20 border-dashed italic",
  not_available: "bg-muted/10 text-muted-foreground/30 border-border/20 border-dashed italic",
};

const READINESS_STYLE: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  blocked: "bg-red-500/10 text-red-500 border-red-500/30",
  at_risk: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  indeterminate: "bg-muted text-muted-foreground border-border/30",
};

function fmtMoney(n?: number) {
  if (n === undefined || n === null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function ageDays(createdAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)));
}

export default function AiOperationsPage() {
  const { data: session, status } = useSession();
  const isAdmin = ORG_ADMIN_ROLES.includes(((session?.user as any)?.role ?? "").toLowerCase());

  // ---- Attention tab ----
  const [attentionItems, setAttentionItems] = useState<any[]>([]);
  const [attentionLoading, setAttentionLoading] = useState(true);
  const [attentionStatus, setAttentionStatus] = useState("open");
  const [attentionPriority, setAttentionPriority] = useState("all");

  const loadAttention = useCallback(async () => {
    try {
      setAttentionLoading(true);
      const params = new URLSearchParams({ status: attentionStatus });
      if (attentionPriority !== "all") params.set("priority", attentionPriority);
      const res = await cachedFetch(`/api/finance/ai-operations/attention?${params.toString()}`);
      const json = await res.json();
      setAttentionItems(json.items || []);
    } catch {
      toast.error("Failed to load attention queue");
    } finally {
      setAttentionLoading(false);
    }
  }, [attentionStatus, attentionPriority]);

  const handleAttentionAction = async (id: string, action: "resolve" | "snooze" | "dismiss") => {
    try {
      const res = await cachedFetch(`/api/finance/ai-operations/attention/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, days: 3 }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Action failed");
      }
      toast.success(action === "resolve" ? "Marked resolved" : action === "snooze" ? "Snoozed 3 days" : "Dismissed");
      loadAttention();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ---- Anomalies to review (AI-15, docs/ai/BRIEF-06-BATCH-E.md Part 0.3) ----
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [anomaliesLoading, setAnomaliesLoading] = useState(true);

  const loadAnomalies = useCallback(async () => {
    try {
      setAnomaliesLoading(true);
      const res = await cachedFetch("/api/finance/ai-operations/attention/anomalies");
      const json = await res.json();
      setAnomalies(json.items || []);
    } catch {
      toast.error("Failed to load anomalies");
    } finally {
      setAnomaliesLoading(false);
    }
  }, []);

  const handleAnomalyReview = async (id: string, outcome: "confirmed" | "expected") => {
    try {
      const res = await cachedFetch(`/api/finance/ai-operations/attention/anomalies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Review failed");
      }
      const json = await res.json();
      if (json.result?.justAutoDisabled) {
        toast.warning(`Detector "${json.result.detectorId}" just auto-disabled — precision fell below the floor`);
      } else {
        toast.success(outcome === "confirmed" ? "Marked confirmed" : "Marked expected — suppressed going forward");
      }
      loadAnomalies();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ---- Close tab ----
  const [closeState, setCloseState] = useState<any>(null);
  const [closePeriods, setClosePeriods] = useState<any[]>([]);
  const [closeLoading, setCloseLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  const loadClose = useCallback(async (period?: string | null) => {
    try {
      setCloseLoading(true);
      const params = period ? `?period=${period}` : "";
      const res = await cachedFetch(`/api/finance/ai-operations/close${params}`);
      const json = await res.json();
      setCloseState(json.state);
      setClosePeriods(json.periods || []);
      if (!period && json.state) setSelectedPeriod(json.state.period);
    } catch {
      toast.error("Failed to load close readiness");
    } finally {
      setCloseLoading(false);
    }
  }, []);

  // ---- Statements tab (AI-21) ----
  const [statement, setStatement] = useState<any>(null);
  const [statementLoading, setStatementLoading] = useState(true);
  const [statementType, setStatementType] = useState<"balance_sheet" | "income_statement">("balance_sheet");
  const [statementPeriod, setStatementPeriod] = useState<string>(() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  const loadStatement = useCallback(async (type?: "balance_sheet" | "income_statement", period?: string) => {
    try {
      setStatementLoading(true);
      const params = new URLSearchParams({ type: type ?? statementType, period: period ?? statementPeriod });
      const res = await cachedFetch(`/api/finance/ai-operations/statements?${params.toString()}`);
      const json = await res.json();
      setStatement(json.statement || null);
    } catch {
      toast.error("Failed to load statement");
    } finally {
      setStatementLoading(false);
    }
  }, [statementType, statementPeriod]);

  // ---- Policy tab (admin only) ----
  const [policies, setPolicies] = useState<any[]>([]);
  const [workflowMeta, setWorkflowMeta] = useState<any[]>([]);
  const [policyLoading, setPolicyLoading] = useState(true);

  const loadPolicy = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setPolicyLoading(true);
      const res = await cachedFetch("/api/finance/ai-operations/policy");
      if (!res.ok) throw new Error("Failed to load policy");
      const json = await res.json();
      setPolicies(json.policies || []);
      setWorkflowMeta(json.workflows || []);
      if ((json.seeded || []).length > 0) {
        toast.success(`Seeded default policy for ${json.seeded.length} workflow(s)`);
      }
    } catch {
      toast.error("Failed to load workflow policies");
    } finally {
      setPolicyLoading(false);
    }
  }, [isAdmin]);

  // ---- Performance tab (admin only, docs/ai/BRIEF-08b-FINAL.md C.1) ----
  const [performanceRows, setPerformanceRows] = useState<any[]>([]);
  const [evidenceBar, setEvidenceBar] = useState<{ overrideRate: number; minSample: number } | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(true);

  const loadPerformance = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setPerformanceLoading(true);
      const res = await cachedFetch("/api/finance/ai-operations/performance");
      if (!res.ok) throw new Error("Failed to load performance");
      const json = await res.json();
      setPerformanceRows(json.rows || []);
      setEvidenceBar(json.evidenceBar || null);
    } catch {
      toast.error("Failed to load workflow performance");
    } finally {
      setPerformanceLoading(false);
    }
  }, [isAdmin]);

  const handlePolicyUpdate = async (workflowId: string, patch: Record<string, unknown>) => {
    try {
      const res = await cachedFetch(`/api/finance/ai-operations/policy/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Update failed");
      }
      const json = await res.json();
      setPolicies((prev) => prev.map((p) => (p.workflowId === workflowId ? json.policy : p)));
      toast.success(`${workflowId} policy updated`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ---- Compliance profile form (Policy tab, admin only — docs/ai/BRIEF-06-BATCH-E.md A.2) ----
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [obligations, setObligations] = useState<any[]>([]);
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [complianceSaving, setComplianceSaving] = useState(false);

  const toDateInput = (d: any) => (d ? String(d).slice(0, 10) : "");

  const loadComplianceProfile = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setComplianceLoading(true);
      const res = await cachedFetch("/api/finance/ai-operations/policy/compliance-profile");
      if (!res.ok) throw new Error("Failed to load compliance profile");
      const json = await res.json();
      setRegistrations((json.profile?.registrations || []).map((r: any) => ({ ...r, effectiveFrom: toDateInput(r.effectiveFrom), effectiveTo: toDateInput(r.effectiveTo) })));
      setObligations(json.profile?.obligations || []);
      setThresholds(json.profile?.thresholds || []);
    } catch {
      toast.error("Failed to load compliance profile");
    } finally {
      setComplianceLoading(false);
    }
  }, [isAdmin]);

  const saveComplianceProfile = async () => {
    try {
      setComplianceSaving(true);
      const res = await cachedFetch("/api/finance/ai-operations/policy/compliance-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrations, obligations, thresholds }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }
      toast.success("Compliance profile saved");
      await loadComplianceProfile();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setComplianceSaving(false);
    }
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    loadAttention();
    loadAnomalies();
    loadClose();
    loadStatement();
    if (isAdmin) {
      loadPolicy();
      loadComplianceProfile();
      loadPerformance();
    }
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") loadAttention();
  }, [attentionStatus, attentionPriority]);

  const rankedBlockers = useMemo(() => {
    if (!closeState) return [];
    const all = (closeState.domains || []).flatMap((d: any) =>
      (d.blockers || []).map((b: any) => ({ ...b, domain: d.domain })),
    );
    return all.sort((a: any, b: any) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));
  }, [closeState]);

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="AI Operations"
      breadcrumbs={[{ label: "Finance", href: "/finance/summary" }, { label: "AI Operations" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "finance"}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={() => {
        loadAttention();
        loadAnomalies();
        loadClose(selectedPeriod);
        loadStatement();
        if (isAdmin) {
          loadPolicy();
          loadComplianceProfile();
          loadPerformance();
        }
      }}
      profilePath="/finance/profile"
    >
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="flex items-center gap-3 text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            <Sparkles className="h-9 w-9" /> AI Operations
          </h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
            Every autonomous workflow, what it noticed, and what it&apos;s allowed to do
          </p>
        </div>

        <Tabs defaultValue="attention" className="w-full">
          <TabsList className="rounded-none bg-transparent border border-border/40 p-0 h-auto">
            <TabsTrigger value="attention" className="rounded-none data-[state=active]:bg-tertiary gap-2 px-5 py-3">
              <Bell className="h-4 w-4" /> Attention
            </TabsTrigger>
            <TabsTrigger value="close" className="rounded-none data-[state=active]:bg-tertiary gap-2 px-5 py-3">
              <FolderClosed className="h-4 w-4" /> Close
            </TabsTrigger>
            <TabsTrigger value="statements" className="rounded-none data-[state=active]:bg-tertiary gap-2 px-5 py-3">
              <FileText className="h-4 w-4" /> Statements
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="policy" className="rounded-none data-[state=active]:bg-tertiary gap-2 px-5 py-3">
                <ShieldCheck className="h-4 w-4" /> Policy
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="performance" className="rounded-none data-[state=active]:bg-tertiary gap-2 px-5 py-3">
                <TrendingUp className="h-4 w-4" /> Performance
              </TabsTrigger>
            )}
          </TabsList>

          {/* ---------------- ATTENTION TAB ---------------- */}
          <TabsContent value="attention" className="mt-4">
            <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
              <div className="border-b border-border/20 px-8 py-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-[26px] font-medium tracking-[-0.05em] text-foreground">Attention Queue</h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    {attentionItems.length} item{attentionItems.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Select value={attentionStatus} onValueChange={setAttentionStatus}>
                    <SelectTrigger className="h-11 w-[160px] rounded-none border-border/20 bg-transparent text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="auto_resolved">Auto-resolved</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={attentionPriority} onValueChange={setAttentionPriority}>
                    <SelectTrigger className="h-11 w-[160px] rounded-none border-border/20 bg-transparent text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <CardContent className="p-0">
                <Table>
                  <TableHeader className="border-border/40">
                    <TableRow>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Priority</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">What / Why</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Workflow</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Amount</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Owner</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Age</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Evidence</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Proposed Action</TableHead>
                      <TableHead className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/30">
                    {attentionLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={9} className="px-6 py-6"><Skeleton className="h-6 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : attentionItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-20 text-center">
                          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-muted-foreground/20" />
                          <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      attentionItems.map((item) => (
                        <TableRow key={item._id} className="hover:bg-white/[0.015] text-sm">
                          <TableCell className="px-6 py-5">
                            <Badge variant="outline" className={`rounded-none uppercase text-[10px] tracking-wider ${PRIORITY_STYLE[item.priority] || ""}`}>
                              {item.priority}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-6 py-5 max-w-sm">
                            <div className="font-medium text-foreground">{item.what}</div>
                            <div className="text-xs text-muted-foreground/70 mt-1">{item.why}</div>
                          </TableCell>
                          <TableCell className="px-6 py-5 font-mono text-xs text-muted-foreground">
                            {item.workflowId}
                            <div className="text-[10px] text-muted-foreground/50">{AI_WORKFLOW_LABELS[item.workflowId] || ""}</div>
                          </TableCell>
                          <TableCell className="px-6 py-5 font-sans tabular-nums">{fmtMoney(item.impactAmount)}</TableCell>
                          <TableCell className="px-6 py-5">{item.owner?.name || "—"}</TableCell>
                          <TableCell className="px-6 py-5 font-sans tabular-nums text-xs">{ageDays(item.createdAt)}d</TableCell>
                          <TableCell className="px-6 py-5 font-sans tabular-nums text-xs">{(item.evidence || []).length}</TableCell>
                          <TableCell className="px-6 py-5 text-xs max-w-xs">{item.proposedAction || "—"}</TableCell>
                          <TableCell className="px-6 py-5 text-right space-x-2">
                            {item.status === "open" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-none h-8 text-xs"
                                  onClick={() => handleAttentionAction(item._id, "resolve")}
                                >
                                  Resolve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="rounded-none h-8 text-xs"
                                  onClick={() => handleAttentionAction(item._id, "snooze")}
                                >
                                  Snooze
                                </Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Anomalies to review (AI-15) — silent anomalies never become AiAttentionItem rows,
                so without this section a human has no surface to review them from, and
                AiDetectorHealth.precision can never move off null (docs/ai/BRIEF-06-BATCH-E.md
                Part 0.3). */}
            <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none mt-4">
              <div className="border-b border-border/20 px-8 py-6">
                <h2 className="text-[22px] font-medium tracking-[-0.05em] text-foreground">Anomalies to Review</h2>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                  {anomalies.length} open — reviewing these is what lets a detector&apos;s precision become measurable
                </p>
              </div>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="border-border/40">
                    <TableRow>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Severity</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Detector</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Observed</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Deviation</TableHead>
                      <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Silent</TableHead>
                      <TableHead className="px-6 py-4 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/30">
                    {anomaliesLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={6} className="px-6 py-6"><Skeleton className="h-6 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : anomalies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                          No open anomalies.
                        </TableCell>
                      </TableRow>
                    ) : (
                      anomalies.map((a) => (
                        <TableRow key={a._id} className="hover:bg-white/[0.015] text-sm">
                          <TableCell className="px-6 py-5">
                            <Badge variant="outline" className={`rounded-none uppercase text-[10px] tracking-wider ${PRIORITY_STYLE[a.severity] || ""}`}>
                              {a.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-6 py-5 font-mono text-xs text-muted-foreground">{a.detectorId}</TableCell>
                          <TableCell className="px-6 py-5 max-w-sm text-xs">{a.observed}</TableCell>
                          <TableCell className="px-6 py-5 max-w-xs text-xs text-muted-foreground/70">{a.deviation}</TableCell>
                          <TableCell className="px-6 py-5 text-xs">{a.silent ? "yes" : "no"}</TableCell>
                          <TableCell className="px-6 py-5 text-right space-x-2">
                            <Button size="sm" variant="outline" className="rounded-none h-8 text-xs" onClick={() => handleAnomalyReview(a._id, "confirmed")}>
                              Confirm as real
                            </Button>
                            <Button size="sm" variant="ghost" className="rounded-none h-8 text-xs" onClick={() => handleAnomalyReview(a._id, "expected")}>
                              Expected
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- CLOSE TAB ---------------- */}
          <TabsContent value="close" className="mt-4 space-y-4">
            <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
              <div className="border-b border-border/20 px-8 py-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-[26px] font-medium tracking-[-0.05em] text-foreground">Close Readiness</h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    Read-only — computed by AI-13, never editable here
                  </p>
                </div>
                {closePeriods.length > 0 && (
                  <Select
                    value={selectedPeriod ?? undefined}
                    onValueChange={(v) => {
                      setSelectedPeriod(v);
                      loadClose(v);
                    }}
                  >
                    <SelectTrigger className="h-11 w-[160px] rounded-none border-border/20 bg-transparent text-[13px]">
                      <SelectValue placeholder="Period" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      {closePeriods.map((p) => (
                        <SelectItem key={p.period} value={p.period}>{p.period}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <CardContent className="p-8">
                {closeLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : !closeState ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    No close-readiness computation exists yet for this tenant. AI-13 computes this on the hourly sweep and on <code>period.horizon.reached</code>.
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="outline" className={`rounded-none uppercase text-xs tracking-wider px-3 py-1.5 ${READINESS_STYLE[closeState.readiness.status] || ""}`}>
                        {closeState.readiness.status}
                      </Badge>
                      <span className="text-sm text-muted-foreground">Period {closeState.period}</span>
                      <span className="text-xs font-mono text-muted-foreground/50">
                        score {closeState.readiness.score} · {closeState.readiness.hardBlockers} hard · {closeState.readiness.materialExceptions} material ·{" "}
                        {closeState.readiness.minorExceptions} minor · {closeState.readiness.staleItems} stale · {closeState.readiness.domainsNotChecked} not checked
                      </span>
                      {closeState.periodClosingStatus && (
                        <span className="text-xs font-mono text-muted-foreground/40">PeriodClosing: {closeState.periodClosingStatus}</span>
                      )}
                    </div>

                    {(closeState.contradictions || []).length > 0 && (
                      <div className="border border-red-500/30 bg-red-500/5 p-4 space-y-2">
                        <div className="text-xs font-mono uppercase tracking-wider text-red-500">Contradictions</div>
                        {closeState.contradictions.map((c: any, i: number) => (
                          <div key={i} className="text-sm text-foreground">{c.detail}</div>
                        ))}
                      </div>
                    )}

                    <div>
                      <div className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground/45 mb-3">Domains</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {closeState.domains.map((d: any) => {
                          const Icon = DOMAIN_STATUS_ICON[d.status] || MinusCircle;
                          return (
                            <div key={d.domain} className={`border p-3 flex items-center gap-2 ${DOMAIN_STATUS_STYLE[d.status] || ""}`}>
                              <Icon className="h-4 w-4 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-medium capitalize truncate">{d.domain.replace(/_/g, " ")}</div>
                                <div className="text-[10px] uppercase tracking-wider opacity-70">{d.status.replace(/_/g, " ")}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground/45 mb-3">
                        Ranked Blockers ({rankedBlockers.length})
                      </div>
                      {rankedBlockers.length === 0 ? (
                        <div className="text-sm text-muted-foreground/60 py-6">No open blockers.</div>
                      ) : (
                        <div className="space-y-2">
                          {rankedBlockers.map((b: any) => (
                            <div key={b.id} className="border border-border/30 p-4 flex items-start justify-between gap-4">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={`rounded-none uppercase text-[10px] tracking-wider ${SEVERITY_STYLE[b.severity] || ""}`}>
                                    {b.severity.replace(/_/g, " ")}
                                  </Badge>
                                  <span className="text-xs font-mono text-muted-foreground/50 uppercase">{b.domain}</span>
                                </div>
                                <div className="font-medium text-foreground text-sm">{b.title}</div>
                                <div className="text-xs text-muted-foreground/70">{b.detail}</div>
                                <div className="text-xs text-muted-foreground/50 italic">{b.recommendedAction}</div>
                              </div>
                              <div className="text-right shrink-0 text-xs font-sans tabular-nums text-muted-foreground/60">
                                {b.amount !== undefined && <div>{fmtMoney(b.amount)}</div>}
                                <div>{b.ageDays}d old</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- STATEMENTS TAB (AI-21) ---------------- */}
          <TabsContent value="statements" className="mt-4">
            <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
              <div className="border-b border-border/20 px-8 py-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-[26px] font-medium tracking-[-0.05em] text-foreground">Statement Intelligence</h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    Annotation only — figures come straight from Finance Reports, never recomputed here
                  </p>
                </div>
                <div className="flex gap-3">
                  <Select
                    value={statementType}
                    onValueChange={(v) => {
                      const next = v as "balance_sheet" | "income_statement";
                      setStatementType(next);
                      loadStatement(next, statementPeriod);
                    }}
                  >
                    <SelectTrigger className="h-11 w-[190px] rounded-none border-border/20 bg-transparent text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      <SelectItem value="balance_sheet">Balance Sheet</SelectItem>
                      <SelectItem value="income_statement">Income Statement</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="month"
                    value={statementPeriod}
                    onChange={(e) => {
                      setStatementPeriod(e.target.value);
                      loadStatement(statementType, e.target.value);
                    }}
                    className="h-11 w-[160px] rounded-none border-border/20 bg-transparent text-[13px]"
                  />
                </div>
              </div>

              <CardContent className="p-8">
                {statementLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : !statement ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">No statement data for this period.</div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge
                        variant="outline"
                        className={`rounded-none uppercase text-xs tracking-wider px-3 py-1.5 ${
                          statement.unsupportedMaterialCount > 0 ? "bg-red-500/10 text-red-500 border-red-500/30" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                        }`}
                      >
                        {statement.unsupportedMaterialCount} unsupported material line{statement.unsupportedMaterialCount === 1 ? "" : "s"}
                      </Badge>
                      {statement.balanceCheck && (
                        <Badge
                          variant="outline"
                          className={`rounded-none uppercase text-xs tracking-wider px-3 py-1.5 ${
                            statement.balanceCheck.balanced ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-red-500/10 text-red-500 border-red-500/30"
                          }`}
                        >
                          {statement.balanceCheck.balanced ? "balanced" : "does not balance"}
                        </Badge>
                      )}
                      <span className="text-xs font-mono text-muted-foreground/50">
                        debit {fmtMoney(statement.totals?.debit)} · credit {fmtMoney(statement.totals?.credit)}
                      </span>
                    </div>

                    {Object.entries(statement.groups || {}).map(([groupName, group]: [string, any]) => (
                      <div key={groupName}>
                        <div className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground/45 mb-3 flex items-center justify-between">
                          <span>{groupName.replace(/_/g, " ")}</span>
                          <span>{fmtMoney(group.total)}</span>
                        </div>
                        <Table>
                          <TableHeader className="border-border/40">
                            <TableRow>
                              <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Account</TableHead>
                              <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Amount</TableHead>
                              <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Materiality</TableHead>
                              <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Reconciliation</TableHead>
                              <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Evidence</TableHead>
                              <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Stale</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="divide-y divide-border/30">
                            {group.lines.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground/50">No accounts in this group.</TableCell>
                              </TableRow>
                            ) : (
                              group.lines.map((line: any) => (
                                <TableRow key={line.accountId} className={`hover:bg-white/[0.015] text-sm ${line.unsupportedMaterial ? "bg-red-500/[0.03]" : ""}`}>
                                  <TableCell className="px-4 py-4">
                                    <div className="font-medium text-foreground">{line.name}</div>
                                    <div className="text-[10px] font-mono text-muted-foreground/50">{line.code}</div>
                                  </TableCell>
                                  <TableCell className="px-4 py-4 font-sans tabular-nums">{fmtMoney(line.amount)}</TableCell>
                                  <TableCell className="px-4 py-4">
                                    <Badge variant="outline" className={`rounded-none uppercase text-[10px] tracking-wider ${MATERIALITY_STYLE[line.materiality] || ""}`}>
                                      {line.materiality.replace(/_/g, " ")}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="px-4 py-4">
                                    <Badge variant="outline" className={`rounded-none uppercase text-[10px] tracking-wider ${RECON_STATUS_STYLE[line.reconciliationStatus] || ""}`}>
                                      {line.reconciliationStatus.replace(/_/g, " ")}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="px-4 py-4">
                                    <Badge variant="outline" className={`rounded-none uppercase text-[10px] tracking-wider ${EVIDENCE_STATUS_STYLE[line.evidenceStatus] || ""}`}>
                                      {line.evidenceStatus.replace(/_/g, " ")}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="px-4 py-4 font-sans tabular-nums text-xs">{line.stalenessDays > 0 ? `${line.stalenessDays}d` : "—"}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- POLICY TAB ---------------- */}
          {isAdmin && (
            <TabsContent value="policy" className="mt-4">
              <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
                <div className="border-b border-border/20 px-8 py-6">
                  <h2 className="text-[26px] font-medium tracking-[-0.05em] text-foreground">Workflow Policy</h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    Ceilings, kill switches and thresholds — admin only
                  </p>
                </div>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="border-border/40">
                      <TableRow>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Workflow</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Max Autonomy</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Kill Switch</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Auto-post Schedules</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Materiality (₹)</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/30">
                      {policyLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={6} className="px-6 py-6"><Skeleton className="h-6 w-full" /></TableCell>
                          </TableRow>
                        ))
                      ) : (
                        policies.map((p) => {
                          const meta = workflowMeta.find((w) => w.id === p.workflowId);
                          return (
                            <TableRow key={p.workflowId} className="text-sm">
                              <TableCell className="px-6 py-5">
                                <div className="font-mono text-xs">{p.workflowId}</div>
                                <div className="text-xs text-muted-foreground/60">{AI_WORKFLOW_LABELS[p.workflowId] || ""}</div>
                                {meta && (
                                  <div className="text-[10px] text-muted-foreground/40 mt-1">declared ceiling: {meta.defaultAutonomy}</div>
                                )}
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <Select
                                  value={p.maxAutonomyLevel}
                                  onValueChange={(v) => handlePolicyUpdate(p.workflowId, { maxAutonomyLevel: v })}
                                >
                                  <SelectTrigger className="h-9 w-[190px] rounded-none border-border/20 bg-transparent text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-none border-border/30">
                                    {AI_AUTONOMY_LEVEL_ORDER.map((lvl) => (
                                      <SelectItem key={lvl} value={lvl}>{lvl.replace(/_/g, " ")}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <Switch
                                  checked={p.killSwitchEnabled}
                                  onCheckedChange={(v) => handlePolicyUpdate(p.workflowId, { killSwitchEnabled: v })}
                                />
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <Switch
                                  checked={p.autoPostSchedules}
                                  onCheckedChange={(v) => handlePolicyUpdate(p.workflowId, { autoPostSchedules: v })}
                                />
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <Input
                                  type="number"
                                  defaultValue={p.materialityThreshold ?? ""}
                                  placeholder="not set"
                                  className="h-9 w-[130px] rounded-none border-border/20 bg-transparent text-xs"
                                  onBlur={(e) => {
                                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                                    if (v !== p.materialityThreshold) handlePolicyUpdate(p.workflowId, { materialityThreshold: v ?? "" });
                                  }}
                                />
                              </TableCell>
                              <TableCell className="px-6 py-5">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  max={1}
                                  defaultValue={p.confidenceThreshold}
                                  className="h-9 w-[90px] rounded-none border-border/20 bg-transparent text-xs"
                                  onBlur={(e) => {
                                    const v = Number(e.target.value);
                                    if (v !== p.confidenceThreshold) handlePolicyUpdate(p.workflowId, { confidenceThreshold: v });
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none mt-6">
                <div className="border-b border-border/20 px-8 py-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-[26px] font-medium tracking-[-0.05em] text-foreground">Compliance Profile</h2>
                    <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                      Registrations, obligations and thresholds — human-entered, AI-12/AI-17 read only
                    </p>
                  </div>
                  <Button size="sm" onClick={saveComplianceProfile} disabled={complianceSaving || complianceLoading}>
                    {complianceSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
                <CardContent className="p-8 space-y-8">
                  {complianceLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60">Registrations</h3>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 rounded-none text-xs"
                            onClick={() => setRegistrations((prev) => [...prev, { jurisdiction: "", taxType: "", registrationNumber: "", effectiveFrom: "", effectiveTo: "" }])}
                          >
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        </div>
                        {registrations.length === 0 ? (
                          <p className="text-xs text-muted-foreground/50">No registrations on file — AI-12/AI-17 will report not_configured.</p>
                        ) : (
                          <div className="space-y-2">
                            {registrations.map((r, i) => (
                              <div key={i} className="grid grid-cols-[1fr_1fr_1.3fr_1fr_1fr_auto] gap-2 items-center">
                                <Input placeholder="Jurisdiction" value={r.jurisdiction} onChange={(e) => setRegistrations((prev) => prev.map((x, xi) => (xi === i ? { ...x, jurisdiction: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Input placeholder="Tax type" value={r.taxType} onChange={(e) => setRegistrations((prev) => prev.map((x, xi) => (xi === i ? { ...x, taxType: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Input placeholder="Registration number" value={r.registrationNumber} onChange={(e) => setRegistrations((prev) => prev.map((x, xi) => (xi === i ? { ...x, registrationNumber: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Input type="date" value={r.effectiveFrom} onChange={(e) => setRegistrations((prev) => prev.map((x, xi) => (xi === i ? { ...x, effectiveFrom: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Input type="date" value={r.effectiveTo} onChange={(e) => setRegistrations((prev) => prev.map((x, xi) => (xi === i ? { ...x, effectiveTo: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Button size="icon" variant="ghost" className="h-9 w-9 rounded-none" onClick={() => setRegistrations((prev) => prev.filter((_, xi) => xi !== i))}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60">Obligations</h3>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 rounded-none text-xs"
                            onClick={() => setObligations((prev) => [...prev, { jurisdiction: "", taxType: "", returnType: "", frequency: "monthly", dueDayOffset: 20, firstPeriod: "", warningWindowDays: 21 }])}
                          >
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        </div>
                        {obligations.length === 0 ? (
                          <p className="text-xs text-muted-foreground/50">No obligations configured — AI-17 will report zero due, never an assumed default.</p>
                        ) : (
                          <div className="space-y-2">
                            {obligations.map((o, i) => (
                              <div key={i} className="grid grid-cols-[0.9fr_0.7fr_1.1fr_0.9fr_0.7fr_0.9fr_0.8fr_auto] gap-2 items-center">
                                <Input placeholder="Jurisdiction" value={o.jurisdiction} onChange={(e) => setObligations((prev) => prev.map((x, xi) => (xi === i ? { ...x, jurisdiction: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Input placeholder="Tax type" value={o.taxType} onChange={(e) => setObligations((prev) => prev.map((x, xi) => (xi === i ? { ...x, taxType: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Input placeholder="Return type" value={o.returnType} onChange={(e) => setObligations((prev) => prev.map((x, xi) => (xi === i ? { ...x, returnType: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Select value={o.frequency} onValueChange={(v) => setObligations((prev) => prev.map((x, xi) => (xi === i ? { ...x, frequency: v } : x)))}>
                                  <SelectTrigger className="h-9 rounded-none text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent className="rounded-none border-border/30">
                                    <SelectItem value="monthly">monthly</SelectItem>
                                    <SelectItem value="quarterly">quarterly</SelectItem>
                                    <SelectItem value="annual">annual</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input type="number" placeholder="Due +days" value={o.dueDayOffset} onChange={(e) => setObligations((prev) => prev.map((x, xi) => (xi === i ? { ...x, dueDayOffset: Number(e.target.value) } : x)))} className="h-9 rounded-none text-xs" />
                                <Input placeholder="First period YYYY-MM" value={o.firstPeriod} onChange={(e) => setObligations((prev) => prev.map((x, xi) => (xi === i ? { ...x, firstPeriod: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Input type="number" placeholder="Warning window (days)" value={o.warningWindowDays ?? 21} onChange={(e) => setObligations((prev) => prev.map((x, xi) => (xi === i ? { ...x, warningWindowDays: Number(e.target.value) } : x)))} className="h-9 rounded-none text-xs" />
                                <Button size="icon" variant="ghost" className="h-9 w-9 rounded-none" onClick={() => setObligations((prev) => prev.filter((_, xi) => xi !== i))}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60">Thresholds</h3>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 rounded-none text-xs"
                            onClick={() => setThresholds((prev) => [...prev, { jurisdiction: "", taxType: "", turnoverThreshold: 0 }])}
                          >
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        </div>
                        {thresholds.length === 0 ? (
                          <p className="text-xs text-muted-foreground/50">No thresholds configured — AI-17 will not check for a crossed-threshold registration gap.</p>
                        ) : (
                          <div className="space-y-2">
                            {thresholds.map((t, i) => (
                              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                                <Input placeholder="Jurisdiction" value={t.jurisdiction} onChange={(e) => setThresholds((prev) => prev.map((x, xi) => (xi === i ? { ...x, jurisdiction: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Input placeholder="Tax type" value={t.taxType} onChange={(e) => setThresholds((prev) => prev.map((x, xi) => (xi === i ? { ...x, taxType: e.target.value } : x)))} className="h-9 rounded-none text-xs" />
                                <Input type="number" placeholder="Turnover threshold (₹)" value={t.turnoverThreshold} onChange={(e) => setThresholds((prev) => prev.map((x, xi) => (xi === i ? { ...x, turnoverThreshold: Number(e.target.value) } : x)))} className="h-9 rounded-none text-xs" />
                                <Button size="icon" variant="ghost" className="h-9 w-9 rounded-none" onClick={() => setThresholds((prev) => prev.filter((_, xi) => xi !== i))}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="performance" className="mt-4">
              <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
                <div className="border-b border-border/20 px-8 py-6">
                  <h2 className="text-[26px] font-medium tracking-[-0.05em] text-foreground">Workflow Performance</h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    Last 30 days, from real proposal-vs-outcome data — never invented
                  </p>
                  {evidenceBar && (
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground/40">
                      Default evidence bar: override rate below {Math.round(evidenceBar.overrideRate * 100)}% over at least {evidenceBar.minSample} proposals. See docs/ai/AUTONOMY_RUNBOOK.md for the real per-workflow bars.
                    </p>
                  )}
                </div>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="border-border/40">
                      <TableRow>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Workflow</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Current Autonomy</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Override Rate</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Automation Coverage</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Avg Resolution</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Runs</TableHead>
                        <TableHead className="px-6 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">Meets Bar?</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/30">
                      {performanceLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={7} className="px-6 py-6"><Skeleton className="h-6 w-full" /></TableCell>
                          </TableRow>
                        ))
                      ) : (
                        performanceRows.map((r) => (
                          <TableRow key={r.workflowId} className="text-sm">
                            <TableCell className="px-6 py-5">
                              <div className="font-mono text-xs">{r.workflowId}</div>
                              <div className="text-xs text-muted-foreground/60">{AI_WORKFLOW_LABELS[r.workflowId] || ""}</div>
                            </TableCell>
                            <TableCell className="px-6 py-5 text-xs">
                              {r.killSwitchEnabled ? (r.currentMaxAutonomy || "").replace(/_/g, " ") : <span className="text-muted-foreground/50">kill switch off</span>}
                            </TableCell>
                            <TableCell className="px-6 py-5 text-xs">
                              {r.metrics?.overrideRate !== null && r.metrics?.overrideRate !== undefined
                                ? `${Math.round(r.metrics.overrideRate * 100)}% (n=${r.metrics.overrideSampleSize})`
                                : <span className="text-muted-foreground/40">not computable</span>}
                            </TableCell>
                            <TableCell className="px-6 py-5 text-xs">
                              {r.metrics?.automationCoverage !== null && r.metrics?.automationCoverage !== undefined
                                ? `${Math.round(r.metrics.automationCoverage * 100)}%`
                                : <span className="text-muted-foreground/40">not computable</span>}
                            </TableCell>
                            <TableCell className="px-6 py-5 text-xs">
                              {r.metrics?.exceptionResolutionHoursAvg !== null && r.metrics?.exceptionResolutionHoursAvg !== undefined
                                ? `${r.metrics.exceptionResolutionHoursAvg}h`
                                : <span className="text-muted-foreground/40">—</span>}
                            </TableCell>
                            <TableCell className="px-6 py-5 text-xs">{r.metrics?.runCount ?? 0}</TableCell>
                            <TableCell className="px-6 py-5">
                              {r.meetsDefaultBar ? (
                                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 rounded-none">Meets bar</Badge>
                              ) : (
                                <Badge className="bg-muted text-muted-foreground border-border/30 rounded-none">Not yet</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
