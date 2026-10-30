'use client';

import { useState, useEffect, type FormEvent } from "react";
import { ArrowRightLeft, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cachedFetch, invalidateCache } from "@/lib/api/cachedFetch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RecordOption = { id: string; label: string; detail: string };

const RECORD_ENDPOINTS: Record<string, string> = {
  Opportunity: "/api/crm/opportunities?page=1&limit=100",
  Case: "/api/crm/cases?view=all&page=1&limit=100",
  Quote: "/api/crm/quotes?page=1&limit=100",
  Account: "/api/crm/accounts?page=1&limit=100",
};

export default function HandoffCenterPage() {
  const [handoffs, setHandoffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [records, setRecords] = useState<RecordOption[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ recordType: "Opportunity", recordId: "", handoffType: "Sales → Operations", toOwner: "", priority: "Medium", notes: "" });

  useEffect(() => {
    fetchHandoffs();
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    const loadRecords = async () => {
      setRecords([]);
      setRecordsLoading(true);
      try {
        const res = await fetch(RECORD_ENDPOINTS[form.recordType], { cache: "no-store" });
        const body = await res.json();
        if (!res.ok || !body.success) throw new Error(body.message || `Could not load ${form.recordType.toLowerCase()} records.`);

        const rows = form.recordType === "Opportunity" ? body.data
          : form.recordType === "Case" ? body.data?.cases
          : form.recordType === "Quote" ? body.data?.quotes
          : body.data?.accounts;

        const options: RecordOption[] = (Array.isArray(rows) ? rows : []).map((record: any) => {
          const label = form.recordType === "Opportunity" ? record.deal_name || record.name || "Untitled opportunity"
            : form.recordType === "Case" ? record.title || record.case_number || "Untitled case"
            : form.recordType === "Quote" ? record.quote_number || "Untitled quote"
            : record.company_name || "Untitled account";
          const detail = form.recordType === "Opportunity" ? record.stage || "Opportunity"
            : form.recordType === "Case" ? record.status || "Case"
            : form.recordType === "Quote" ? record.status || "Quote"
            : record.industry || "Account";
          return { id: String(record._id), label, detail };
        }).filter((record: RecordOption) => /^[a-fA-F0-9]{24}$/.test(record.id));

        if (!cancelled) setRecords(options);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load CRM records.");
      } finally {
        if (!cancelled) setRecordsLoading(false);
      }
    };
    void loadRecords();
    return () => { cancelled = true; };
  }, [createOpen, form.recordType]);

  const fetchHandoffs = async () => {
    // For demo purposes, we fetch all handoffs. In a real app we'd filter by incoming/outgoing
    const res = await cachedFetch("/api/crm/handoffs");
    const data = await res.json();
    if (data.success) {
      setHandoffs(data.data);
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch(`/api/crm/handoffs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      invalidateCache("/api/crm/handoffs");
      fetchHandoffs();
    }
  };

  const openCreate = async () => {
    setCreateOpen(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (res.ok && Array.isArray(data.users)) setUsers(data.users);
    } catch { /* the form remains usable if the owner list request fails */ }
  };

  const createHandoff = async (event: FormEvent) => {
    event.preventDefault();
    const recordId = form.recordId.trim();
    if (!recordId) {
      toast.error("Enter the CRM record ID.", { id: "handoff-create-validation" });
      return;
    }
    if (!/^[a-fA-F0-9]{24}$/.test(recordId)) {
      toast.error("Enter a valid 24-character CRM record ID.", { id: "handoff-create-validation" });
      return;
    }
    if (!form.toOwner) {
      toast.error("Choose a receiving teammate.", { id: "handoff-create-validation" });
      return;
    }
    if (!form.handoffType.trim()) {
      toast.error("Enter the handoff type.", { id: "handoff-create-validation" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/crm/handoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, recordId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || data.error || "Could not create handoff. Please try again.");
      toast.dismiss("handoff-create-validation");
      toast.success("Handoff created successfully.");
      invalidateCache("/api/crm/handoffs");
      setCreateOpen(false);
      setForm({ recordType: "Opportunity", recordId: "", handoffType: "Sales → Operations", toOwner: "", priority: "Medium", notes: "" });
      await fetchHandoffs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create handoff", { id: "handoff-create-validation" });
    } finally { setCreating(false); }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-orange-400" />
            Multi-Team Handoff Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage seamless transitions between Sales, Operations, Support, and Finance.
          </p>
        </div>
        <Button className="bg-primary text-xs h-8" onClick={openCreate}>New Handoff</Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create handoff</DialogTitle>
            <DialogDescription>Choose the CRM record and teammate who should receive it.</DialogDescription>
          </DialogHeader>
      <form noValidate onSubmit={createHandoff} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Record type</Label><Select value={form.recordType} onValueChange={(recordType) => setForm({ ...form, recordType, recordId: "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Opportunity", "Case", "Quote", "Account"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
              <div className="min-w-0 space-y-2"><Label>CRM record</Label><Select value={form.recordId} onValueChange={(recordId) => setForm({ ...form, recordId })} disabled={recordsLoading}><SelectTrigger className="min-w-0"><SelectValue placeholder={recordsLoading ? "Loading records…" : `Choose ${form.recordType.toLowerCase()}`}>{form.recordId || undefined}</SelectValue></SelectTrigger><SelectContent>{records.length ? records.map((record) => <SelectItem key={record.id} value={record.id}><span className="flex min-w-0 flex-col"><span className="truncate">{record.label}</span><span className="text-xs text-muted-foreground">{record.detail} · {record.id}</span></span></SelectItem>) : <SelectItem value="__no_records" disabled>No records found for this type.</SelectItem>}</SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>Handoff type</Label><Input required value={form.handoffType} onChange={(e) => setForm({ ...form, handoffType: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Receiving teammate</Label><Select required value={form.toOwner} onValueChange={(toOwner) => setForm({ ...form, toOwner })}><SelectTrigger><SelectValue placeholder="Choose teammate" /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user._id} value={user._id}>{user.name || user.email}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Priority</Label><Select value={form.priority} onValueChange={(priority) => setForm({ ...form, priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Low", "Medium", "High", "Critical"].map((priority) => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={creating || !form.toOwner}>{creating ? "Creating…" : "Create handoff"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-muted-foreground">Type</TableHead>
              <TableHead className="text-muted-foreground">From &rarr; To</TableHead>
              <TableHead className="text-muted-foreground">Record</TableHead>
              <TableHead className="text-muted-foreground">Priority</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : handoffs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground border border-dashed border-border">No active handoffs in queue.</TableCell></TableRow>
            ) : handoffs.map(handoff => (
              <TableRow key={handoff._id} className="border-border hover:bg-accent/50 text-sm">
                <TableCell className="font-mono text-xs text-muted-foreground">{new Date(handoff.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium">{handoff.handoffType}</TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground">{handoff.fromOwner?.name || 'Unknown'}</div>
                  <div className="text-sm font-semibold">{handoff.toOwner?.name || 'Unknown'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-background">{handoff.recordType}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${
                    handoff.priority === 'Critical' ? 'border-red-900/50 text-red-400 bg-red-900/10' : ''
                  }`}>{handoff.priority}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${
                    handoff.status === 'Pending' ? 'border-yellow-900/50 text-yellow-400' :
                    handoff.status === 'Accepted' ? 'border-blue-900/50 text-blue-400' :
                    handoff.status === 'Completed' ? 'border-green-900/50 text-green-400' : ''
                  }`}>{handoff.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {handoff.status === "Pending" && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-400" onClick={() => updateStatus(handoff._id, "Accepted")}><CheckCircle className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => updateStatus(handoff._id, "Rejected")}><XCircle className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-yellow-400" onClick={() => updateStatus(handoff._id, "Clarification Requested")}><AlertCircle className="w-4 h-4" /></Button>
                    </div>
                  )}
                  {handoff.status === "Accepted" && (
                    <Button variant="outline" size="sm" className="h-7 text-xs border-green-900 text-green-400 hover:bg-green-900" onClick={() => updateStatus(handoff._id, "Completed")}>Mark Complete</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
