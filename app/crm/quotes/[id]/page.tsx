'use client';

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import QuoteBuilder from "@/components/crm/QuoteBuilder";
import ApprovalTimeline from "@/components/crm/ApprovalTimeline";
import DocumentManager from "@/components/crm/DocumentManager";
import Link from "next/link";
import {
  ChevronLeft,
  Download,
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Copy,
  ExternalLink,
} from "lucide-react";

// ─── Status colour ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  Approved: "bg-green-700 text-green-100",
  Accepted: "bg-emerald-700 text-emerald-100",
  Sent: "bg-blue-700 text-blue-100",
  Viewed: "bg-indigo-700 text-indigo-100",
  Rejected: "bg-red-700 text-red-100",
  Expired: "bg-red-900 text-red-200",
  "Pending Approval": "bg-yellow-700 text-yellow-100",
  Draft: "bg-neutral-700 text-neutral-100",
  Revised: "bg-neutral-600 text-neutral-100",
};

// ─── Reject modal ─────────────────────────────────────────────────────────────

function RejectModal({
  open,
  quoteId,
  onDone,
  onCancel,
}: {
  open: boolean;
  quoteId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!notes.trim()) {
      toast.error("Rejection notes are required.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/crm/quotes/${quoteId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success("Quote rejected.");
      onDone();
    } else {
      toast.error(data.message || "Rejection failed.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Quote</DialogTitle>
        </DialogHeader>
        <div>
          <label className="text-sm text-neutral-400 block mb-1">
            Rejection Notes <span className="text-red-400">*</span>
          </label>
          <textarea
            className="w-full bg-neutral-950 border border-neutral-700 rounded p-3 h-28 text-sm resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Explain why this quote is being rejected..."
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            <XCircle className="w-4 h-4 mr-1" />
            {saving ? "Rejecting..." : "Reject Quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuoteDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(props.params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  const fetchQuote = async () => {
    try {
      const res = await fetch(`/api/crm/quotes/${id}`, { cache: "no-store" });
      // Never call res.json() blindly — a 5xx can return an empty body, which
      // throws "Unexpected end of JSON input" as an uncaught promise rejection.
      const d = await res.json().catch(() => null);
      if (res.ok && d?.success) setData(d.data);
      else toast.error(d?.message || "Failed to load this quote.");
    } catch {
      toast.error("Failed to load this quote.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
  }, [id]);

  const handleUpdate = async (quoteData: any) => {
    setActionPending(true);
    const payload = { ...quoteData };
    const res = await fetch(`/api/crm/quotes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) {
      if (result.versioned) {
        toast.success("New version created!");
        window.location.href = `/crm/quotes/${result.data._id}`;
      } else {
        toast.success("Quote updated!");
        fetchQuote();
      }
    } else {
      toast.error(result.message || "Update failed");
    }
    setActionPending(false);
  };

  const approve = async () => {
    setActionPending(true);
    const res = await fetch(`/api/crm/quotes/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Approved via UI" }),
    });
    const result = await res.json();
    if (res.ok) {
      toast.success("Quote approved!");
      fetchQuote();
    } else {
      toast.error(result.message || "Cannot approve.");
    }
    setActionPending(false);
  };

  const send = async () => {
    setActionPending(true);
    const res = await fetch(`/api/crm/quotes/${id}/send`, { method: "POST" });
    const result = await res.json();
    if (res.ok) {
      toast.success("Quote sent!");
      fetchQuote();
    } else {
      toast.error(result.message || "Cannot send.");
    }
    setActionPending(false);
  };

  const downloadPdf = () => {
    window.open(`/api/crm/quotes/${id}/pdf`, "_blank");
    toast.success("PDF download started.");
  };

  if (loading) return <div className="p-6 text-neutral-400">Loading quote...</div>;
  if (!data) return <div className="p-6 text-red-400">Quote not found.</div>;

  const isLocked = ["Approved", "Sent", "Accepted"].includes(data.status);
  const canApprove = data.status === "Pending Approval";
  const canSend = data.status === "Approved";
  const statusClass = STATUS_COLOR[data.status] || "bg-neutral-700 text-neutral-100";
  const isExpired =
    data.validity_date && new Date(data.validity_date) < new Date();

  return (
    <div className="p-6 space-y-6">
      {/* Reject modal */}
      <RejectModal
        open={showRejectModal}
        quoteId={id}
        onDone={() => {
          setShowRejectModal(false);
          fetchQuote();
        }}
        onCancel={() => setShowRejectModal(false)}
      />

      {/* Back nav */}
      <Link href="/crm/quotes">
        <Button variant="ghost" size="sm" className="h-8 text-xs -ml-2">
          <ChevronLeft className="w-4 h-4 mr-1" />
          All Quotes
        </Button>
      </Link>

      {/* Header card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono">{data.quote_number}</h1>
              <Badge variant="secondary">V{data.version}</Badge>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}`}
              >
                {data.status}
              </span>
              {isExpired && data.status !== "Accepted" && (
                <span className="text-xs text-red-400 font-semibold">
                  ⚠ Expired
                </span>
              )}
            </div>
            <div className="mt-2 text-sm text-neutral-400 space-y-0.5">
              <p>
                <span className="text-neutral-500">Account:</span>{" "}
                {data.account_id?.company_name || "—"}
              </p>
              <p>
                <span className="text-neutral-500">Opportunity:</span>{" "}
                {data.opportunity_id?.deal_name || "—"}
              </p>
              <p>
                <span className="text-neutral-500">Valid Until:</span>{" "}
                <span className={isExpired ? "text-red-400" : ""}>
                  {data.validity_date
                    ? new Date(data.validity_date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </span>
              </p>
              {data.sent_at && (
                <p>
                  <span className="text-neutral-500">Sent:</span>{" "}
                  {new Date(data.sent_at).toLocaleDateString()}
                </p>
              )}
              {data.approved_by_id && (
                <p>
                  <span className="text-neutral-500">Approved by:</span>{" "}
                  {data.approved_by_id?.name || data.approved_by_id?.email}
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {canApprove && (
              <>
                <Button
                  className="bg-green-700 hover:bg-green-600"
                  onClick={approve}
                  disabled={actionPending}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectModal(true)}
                  disabled={actionPending}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Reject
                </Button>
              </>
            )}
            {canSend && (
              <Button
                className="bg-blue-700 hover:bg-blue-600"
                onClick={send}
                disabled={actionPending}
              >
                <Send className="w-4 h-4 mr-1" />
                Send to Customer
              </Button>
            )}
            <Button variant="outline" onClick={downloadPdf} disabled={actionPending}>
              <Download className="w-4 h-4 mr-1" />
              Download PDF
            </Button>
            {data.opportunity_id && (
              <Link href={`/crm/opportunities/${data.opportunity_id._id || data.opportunity_id}`}>
                <Button variant="ghost" size="sm">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  View Opportunity
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Value summary strip */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-neutral-800">
          <div>
            <p className="text-xs text-neutral-500">Discount</p>
            <p className="font-semibold text-red-400">
              -${(data.discount_total || 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Tax</p>
            <p className="font-semibold text-yellow-400">
              +${(data.tax_total || 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Grand Total</p>
            <p className="font-bold text-xl text-green-400">
              ${(data.grand_total || 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Locked warning */}
      {isLocked && (
        <div className="bg-blue-900/20 border border-blue-800 px-4 py-3 rounded-lg text-sm text-blue-200 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 shrink-0" />
          This quote is locked. Editing will create a new version (V
          {data.version + 1}).
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="builder">
        <TabsList className="bg-neutral-900 border border-neutral-800">
          <TabsTrigger value="builder">Quote Builder</TabsTrigger>
          <TabsTrigger value="approvals">
            Approvals ({data.approvalHistory?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="mt-4">
          <QuoteBuilder
            initialData={data}
            readOnly={false}
            onSave={handleUpdate}
          />
        </TabsContent>

        <TabsContent value="approvals" className="mt-4">
          <ApprovalTimeline
            approvalHistory={data.approvalHistory}
            currentStatus={data.status}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
            <h3 className="font-bold mb-4">Linked Documents</h3>
            <DocumentManager
              linkedRecordId={id}
              linkedRecordType="Quote"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
