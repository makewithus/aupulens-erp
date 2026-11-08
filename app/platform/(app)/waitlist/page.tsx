"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  Info,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WAITLIST_STATUS_VALUES, WaitlistStatus } from "@/lib/constants/statuses";

interface WaitlistRecord {
  _id: string;
  waitlistId: string;
  fullName?: string;
  companyName: string;
  email: string;
  phone?: string;
  teamSize?: string;
  topic?: string;
  plan?: string;
  message?: string;
  formType: "book_demo" | "contact";
  status: WaitlistStatus;
  sourceUrl?: string;
  ipAddress?: string;
  emailDeliveryStatus: "pending" | "sent" | "failed" | "skipped";
  emailDeliveryError?: string;
  emailDeliveryAt?: string;
  notes?: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface WaitlistApiResponse {
  success: boolean;
  message?: string;
  data: {
    items: WaitlistRecord[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    counts: {
      New: number;
      Contacted: number;
      Approved: number;
      Onboarded: number;
      Rejected: number;
      total: number;
    };
  };
}

function formatIST(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d) + " IST";
  } catch {
    return dateStr;
  }
}

function getStatusBadge(status: WaitlistStatus) {
  switch (status) {
    case "New":
      return <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/30">New</Badge>;
    case "Contacted":
      return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">Contacted</Badge>;
    case "Approved":
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Approved</Badge>;
    case "Onboarded":
      return <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30">Onboarded</Badge>;
    case "Rejected":
      return <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30">Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getEmailDeliveryBadge(status: string) {
  switch (status) {
    case "sent":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> Sent to team
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-rose-400 font-medium">
          <XCircle className="w-3.5 h-3.5" /> Delivery failed
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-medium">
          <Clock className="w-3.5 h-3.5" /> Pending
        </span>
      );
    default:
      return <span className="text-xs text-muted-foreground">{status}</span>;
  }
}

export default function WaitlistAdminPage() {
  const [data, setData] = useState<WaitlistApiResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formTypeFilter, setFormTypeFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Detail Modal
  const [selectedProspect, setSelectedProspect] = useState<WaitlistRecord | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editStatus, setEditStatus] = useState<WaitlistStatus>("New");
  const [editNotes, setEditNotes] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "20",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (formTypeFilter && formTypeFilter !== "all") params.set("formType", formTypeFilter);

      const res = await fetch(`/api/platform/waitlist?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load: ${res.status}`);
      }
      const json: WaitlistApiResponse = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.message || "Failed to load waitlist.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to waitlist service.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, formTypeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenDetail = (record: WaitlistRecord) => {
    setSelectedProspect(record);
    setEditStatus(record.status);
    setEditNotes(record.notes || "");
  };

  const handleSaveProspectChanges = async () => {
    if (!selectedProspect) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/platform/waitlist/${selectedProspect._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          notes: editNotes,
        }),
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        toast.success("Prospect status and notes updated.");
        setSelectedProspect(resData.data);
        loadData();
      } else {
        toast.error(resData.message || "Failed to update prospect.");
      }
    } catch {
      toast.error("Failed to connect to backend.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {"Global Admin // Prospective Customers"}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Waitlist Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Prospective clients who submitted Book a Demo or Contact requests on aupulens.com.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadData()}
          disabled={loading}
          className="gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Total Prospects
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-foreground">
              {data?.counts?.total ?? "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All submitted requests
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-sky-400">
              New / Uncontacted
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-sky-400">
              {data?.counts?.New ?? "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting outreach
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-400">
              In Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-amber-400">
              {data?.counts?.Contacted ?? "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Engaged with sales
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-emerald-400">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-emerald-400">
              {data?.counts?.Approved ?? "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ready for future onboarding
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border border-border/60 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search company, contact person, email or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/80"
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[140px] bg-background/80">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {WAITLIST_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={formTypeFilter}
                onValueChange={(val) => {
                  setFormTypeFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[140px] bg-background/80">
                  <SelectValue placeholder="Form" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Forms</SelectItem>
                  <SelectItem value="book_demo">Book Demo</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden">
        {error ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground">Error loading waitlist</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{error}</p>
            <Button variant="outline" size="sm" onClick={() => loadData()} className="mt-4">
              Try Again
            </Button>
          </div>
        ) : loading && !data ? (
          <div className="p-12 text-center text-muted-foreground">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-sky-400" />
            <p className="text-sm font-mono">Retrieving waitlist records...</p>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <h3 className="text-base font-semibold text-foreground">No waitlist prospects found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {debouncedSearch || statusFilter !== "all" || formTypeFilter !== "all"
                ? "No prospects match your current search and filter criteria."
                : "No demo or contact requests have been submitted yet."}
            </p>
            {(debouncedSearch || statusFilter !== "all" || formTypeFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setFormTypeFilter("all");
                }}
                className="mt-4"
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="font-semibold text-foreground">Company Name</TableHead>
                  <TableHead className="font-semibold text-foreground">Contact Person</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Form Type</TableHead>
                  <TableHead>Submission Date (IST)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item._id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
                        <span className="truncate max-w-[200px]" title={item.companyName}>
                          {item.companyName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[160px]">
                          {item.fullName || <span className="text-muted-foreground italic">Not provided</span>}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <a
                        href={`mailto:${item.email}`}
                        className="hover:text-sky-400 transition-colors underline-offset-4 hover:underline"
                      >
                        {item.email}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.phone || <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-mono">
                        {item.formType === "book_demo" ? "Book a Demo" : "Contact"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatIST(item.submittedAt)}
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenDetail(item)}
                        className="h-8 gap-1.5 text-xs"
                      >
                        <Info className="w-3.5 h-3.5" />
                        More Info
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-border/40 text-sm text-muted-foreground">
            <div>
              Showing page <span className="font-medium text-foreground">{data.page}</span> of{" "}
              <span className="font-medium text-foreground">{data.totalPages}</span> ({data.total} total)
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Prospect Detail Modal */}
      <Dialog open={!!selectedProspect} onOpenChange={(open) => !open && setSelectedProspect(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedProspect && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs uppercase tracking-wider text-sky-400">
                    {"// Prospect Details"}
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {selectedProspect.waitlistId}
                  </Badge>
                </div>
                <DialogTitle className="text-xl font-bold flex items-center justify-between">
                  <span>{selectedProspect.companyName}</span>
                  {getStatusBadge(selectedProspect.status)}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 py-4 text-sm">
                {/* Contact & Company Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/20 border border-border/50">
                  <div>
                    <Label className="text-xs text-muted-foreground">Contact Person</Label>
                    <div className="font-semibold text-foreground mt-0.5">
                      {selectedProspect.fullName || "Not provided"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Work Email</Label>
                    <div className="font-semibold text-foreground mt-0.5">
                      <a
                        href={`mailto:${selectedProspect.email}`}
                        className="text-sky-400 hover:underline"
                      >
                        {selectedProspect.email}
                      </a>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone Number</Label>
                    <div className="font-semibold text-foreground mt-0.5">
                      {selectedProspect.phone || "Not provided"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Company Name</Label>
                    <div className="font-semibold text-foreground mt-0.5">
                      {selectedProspect.companyName}
                    </div>
                  </div>
                </div>

                {/* Additional Submitted Form Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-lg bg-muted/20 border border-border/50">
                  <div>
                    <Label className="text-xs text-muted-foreground">Form Type</Label>
                    <div className="font-medium text-foreground mt-0.5">
                      {selectedProspect.formType === "book_demo" ? "Book a Demo" : "Contact Form"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Team Size</Label>
                    <div className="font-medium text-foreground mt-0.5">
                      {selectedProspect.teamSize || "—"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Interest / Topic</Label>
                    <div className="font-medium text-foreground mt-0.5">
                      {selectedProspect.topic || "—"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Selected Plan</Label>
                    <div className="font-medium text-foreground mt-0.5">
                      {selectedProspect.plan || "—"}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Submission Time (IST)</Label>
                    <div className="font-medium text-foreground mt-0.5">
                      {formatIST(selectedProspect.submittedAt)}
                    </div>
                  </div>
                </div>

                {/* Message if present */}
                {selectedProspect.message && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                      Message / Requirement Description
                    </Label>
                    <div className="p-3.5 rounded-lg bg-background border border-border/60 text-muted-foreground text-sm whitespace-pre-wrap leading-relaxed">
                      {selectedProspect.message}
                    </div>
                  </div>
                )}

                {/* Notification Delivery Details */}
                <div className="p-3.5 rounded-lg bg-muted/20 border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Email Notification: </span>
                    {getEmailDeliveryBadge(selectedProspect.emailDeliveryStatus)}
                    {selectedProspect.emailDeliveryAt && (
                      <span className="text-muted-foreground ml-2">
                        at {formatIST(selectedProspect.emailDeliveryAt)}
                      </span>
                    )}
                  </div>
                  {selectedProspect.sourceUrl && (
                    <div className="text-muted-foreground truncate max-w-xs" title={selectedProspect.sourceUrl}>
                      Source: {selectedProspect.sourceUrl}
                    </div>
                  )}
                </div>

                {/* Administrative Status Management & Notes */}
                <div className="space-y-3 pt-2 border-t border-border/40">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="editStatus" className="text-xs font-semibold">
                        Update Status
                      </Label>
                      <Select
                        value={editStatus}
                        onValueChange={(val) => setEditStatus(val as WaitlistStatus)}
                      >
                        <SelectTrigger id="editStatus" className="mt-1.5">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {WAITLIST_STATUS_VALUES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="editNotes" className="text-xs font-semibold">
                      Internal Admin Notes
                    </Label>
                    <Textarea
                      id="editNotes"
                      placeholder="Add notes about conversations, qualification or follow-up..."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="mt-1.5 resize-none h-20"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setSelectedProspect(null)}
                  disabled={updating}
                >
                  Close
                </Button>
                <Button
                  onClick={handleSaveProspectChanges}
                  disabled={updating}
                  className="gap-2"
                >
                  {updating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

