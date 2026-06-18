'use client';
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";

const SOURCES = [
  "Organic Search","Paid Ads","Referral","Event","Social Media",
  "Direct Website","Outbound Calling","Partner Channel","Repeat Customer",
  "Website Form","WhatsApp","Email Import","CSV Import","Chatbot",
  "Manual Entry","Other",
];

const PRIORITIES = ["Low", "Medium", "High"];

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-600",
  "Attempting Contact": "bg-yellow-600",
  Connected: "bg-cyan-600",
  Qualified: "bg-green-600",
  Nurture: "bg-purple-600",
  Disqualified: "bg-red-600",
  Converted: "bg-emerald-600",
};

const EMPTY_FORM = {
  lead_name: "",
  company_name: "",
  email: "",
  phone: "",
  source: "",
  priority: "Medium",
  industry: "",
  location: "",
  notes: "",
  next_followup_date: "",
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const { data: session } = useSession();

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/leads?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data.success) setLeads(data.data.leads ?? data.data ?? []);
    } catch {
      toast.error("Failed to load leads.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchLeads(), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lead_name.trim()) {
      toast.error("Lead name is required.");
      return;
    }
    if (!form.source) {
      toast.error("Source is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_name: form.lead_name.trim(),
          company_name: form.company_name.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          source: form.source,
          priority: form.priority,
          industry: form.industry.trim() || undefined,
          location: form.location.trim() || undefined,
          notes: form.notes.trim() || undefined,
          next_followup_date: form.next_followup_date || undefined,
          owner_id: session?.user?.id,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        toast.warning("Duplicate lead detected — a lead with this email or phone already exists.");
        return;
      }
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to create lead.");
        return;
      }
      toast.success(`Lead "${form.lead_name}" created successfully!`);
      setSheetOpen(false);
      setForm(EMPTY_FORM);
      fetchLeads();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Leads</h1>
        <Button onClick={() => setSheetOpen(true)} className="bg-primary gap-2">
          <Plus className="h-4 w-4" />
          New Lead
        </Button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No leads found. Click &quot;+ New Lead&quot; to create one.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead._id}>
                  <TableCell className="font-medium">{lead.lead_name}</TableCell>
                  <TableCell>{lead.company_name || "—"}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[lead.status] ?? "bg-neutral-600"}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-green-600">{lead.lead_score}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/crm/leads/${lead._id}`}>
                      <Button variant="secondary" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* New Lead Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>New Lead</SheetTitle>
            <SheetDescription>
              Fill in the details below to capture a new lead.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            {/* Lead Name */}
            <div className="space-y-1.5">
              <Label htmlFor="lead_name">
                Lead Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="lead_name"
                placeholder="e.g. Alice Johnson"
                value={form.lead_name}
                onChange={(e) => set("lead_name", e.target.value)}
                required
                disabled={submitting}
              />
            </div>

            {/* Company */}
            <div className="space-y-1.5">
              <Label htmlFor="company_name">Company</Label>
              <Input
                id="company_name"
                placeholder="e.g. Acme Corp"
                value={form.company_name}
                onChange={(e) => set("company_name", e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Email + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="alice@acme.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="+91-9876543210"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Source + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) => set("source", v)}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => set("priority", v)}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Industry + Location */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  placeholder="e.g. Technology"
                  value={form.industry}
                  onChange={(e) => set("industry", e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g. Mumbai"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Follow-up Date */}
            <div className="space-y-1.5">
              <Label htmlFor="next_followup_date">Next Follow-up Date</Label>
              <Input
                id="next_followup_date"
                type="date"
                value={form.next_followup_date}
                onChange={(e) => set("next_followup_date", e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional context about this lead..."
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                disabled={submitting}
              />
            </div>

            <SheetFooter className="pt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setSheetOpen(false); setForm(EMPTY_FORM); }}
                disabled={submitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-primary"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating…</>
                ) : (
                  "Create Lead"
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
