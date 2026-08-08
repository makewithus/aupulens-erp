'use client';
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { AiTextarea } from "@/components/ai/AiTextarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import {
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/shared/Table";
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
import { Loader2, Plus, FolderKanban } from "lucide-react";
import { confirmDialog } from "@/components/providers/ConfirmRoot";

const SOURCES = [
  "Organic Search","Paid Ads","Referral","Event","Social Media",
  "Direct Website","Outbound Calling","Partner Channel","Repeat Customer",
  "Website Form","WhatsApp","Email Import","CSV Import","Chatbot",
  "Manual Entry","Other",
];

const PRIORITIES = ["Low", "Medium", "High"];

const STATUS_COLORS_REDESIGNED: Record<string, string> = {
  New: "text-[#6CADF5]",                  // Soft blue
  "Attempting Contact": "text-[#F1DF38]", // Soft yellow
  Connected: "text-[#6CADF5]",             // Soft blue-cyan
  Qualified: "text-[#8AE06C]",             // Soft green
  Nurture: "text-[#A77DFF]",               // Soft purple
  Disqualified: "text-[#F56868]",          // Soft red
  Converted: "text-[#8AE06C]",             // Soft emerald/green
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

  // AI-native pre-fill: if the assistant prepared a lead, open the form with the
  // extracted values pre-filled and surface its suggestions. The user still
  // reviews and clicks "Create Lead". Works whether we navigated here or were
  // already on this page (see useAiPrefill).
  useAiPrefill("lead", (p) => {
    setForm((prev) => {
      const next: any = { ...prev };
      for (const k of Object.keys(EMPTY_FORM)) {
        const v = (p.data as any)?.[k];
        if (v !== undefined && v !== null && v !== "") next[k] = String(v);
      }
      return next;
    });
    setSheetOpen(true);
    if (p.suggestions && p.suggestions.length) {
      toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
    }
  });

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
      const created = await submitLead(false);
      if (!created) return;
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

  const submitLead = async (confirmDuplicate: boolean): Promise<boolean> => {
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
        confirmDuplicate,
      }),
    });
    const data = await res.json();

    if (res.status === 409) {
      if (data.fuzzy) {
        const matchNames = (data.matches || [])
          .map((m: any) => m.record?.lead_name || m.record?.email || "an existing lead")
          .join(", ");
        const proceed = await confirmDialog({
          title: "Possible duplicate lead",
          description: `This looks similar to ${matchNames}. Create it anyway?`,
        });
        if (proceed) return submitLead(true);
        return false;
      }
      toast.warning("Duplicate lead detected — a lead with this email or phone already exists.");
      return false;
    }

    if (!res.ok || !data.success) {
      toast.error(data.message || "Failed to create lead.");
      return false;
    }

    return true;
  };

  return (
    <div className="space-y-6">
      {/* Table Card */}
      <Card className="overflow-hidden border-border/40 shadow-none bg-background">
        {/* Header */}
        <div className="border-b border-border/20 px-6 py-4">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="shrink-0">
              <h2 className="text-[30px] font-medium tracking-[-0.05em]">
                All Leads
              </h2>

              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                {leads.length} {leads.length === 1 ? "Lead" : "Leads"}
              </p>
            </div>

            <div className="w-full max-w-md flex flex-row gap-8">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search leads..."
              />
              <Button
              onClick={() => setSheetOpen(true)}
              className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Lead
            </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          <TableContainer>
            <TableHead>
              <TableRow className="text-left hover:bg-transparent">
                <TableHeaderCell>Lead Name</TableHeaderCell>
                <TableHeaderCell>Company</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Score</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {/* Name */}
                    <TableCell>
                      <Skeleton className="h-5 w-32" />
                    </TableCell>

                    {/* Company */}
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Skeleton className="h-5 w-16" />
                    </TableCell>

                    {/* Score */}
                    <TableCell>
                      <Skeleton className="h-5 w-10" />
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex justify-end">
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : leads.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-24 text-center">
                    <FolderKanban className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />

                    <h3 className="text-lg font-medium">
                      {search ? "No leads match your filters" : "No leads found"}
                    </h3>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {search ? "Try adjusting your search query." : "Click \"New Lead\" to create one."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead._id}>
                    {/* Lead Name */}
                    <TableCell>
                      <h3 className="text-[18px] font-medium tracking-[-0.03em] text-foreground">
                        {lead.lead_name}
                      </h3>
                    </TableCell>

                    {/* Company */}
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {lead.company_name || "—"}
                      </span>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Badge
                        className={`
                          rounded-none
                          border-0
                          bg-transparent
                          px-0
                          font-mono
                          text-[12px]
                          uppercase
                          tracking-[0.12em]
                          hover:bg-transparent
                          shadow-none
                          ${STATUS_COLORS_REDESIGNED[lead.status] ?? "text-muted-foreground"}
                        `}
                      >
                        {lead.status}
                      </Badge>
                    </TableCell>

                    {/* Score */}
                    <TableCell>
                      <span className="font-mono text-sm text-muted-foreground">
                        {lead.lead_score ?? 0}
                      </span>
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Link href={`/crm/leads/${lead._id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all duration-300"
                          >
                            View
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </TableContainer>
        </CardContent>
      </Card>

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
              <AiTextarea
                label="Lead notes"
                aiContext={{ lead_name: form.lead_name, company_name: form.company_name, industry: form.industry }}
                placeholder="Any additional context about this lead... (AI will suggest — press Tab to accept)"
                value={form.notes}
                onValueChange={(v) => set("notes", v)}
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
