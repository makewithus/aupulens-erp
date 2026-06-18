'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DocumentManager from "@/components/crm/DocumentManager";
import {
  Search,
  FileText,
  Filter,
  LayoutList,
  LayoutGrid,
  Clock,
  Download,
} from "lucide-react";
import { toast } from "sonner";

// ─── Linked record types ──────────────────────────────────────────────────────

const RECORD_TYPES = [
  "All",
  "Lead",
  "Account",
  "Contact",
  "Opportunity",
  "Quote",
  "Contract",
  "Case",
] as const;

type RecordFilter = (typeof RECORD_TYPES)[number];

// ─── File type icon helper ────────────────────────────────────────────────────

function FileIcon({ type }: { type?: string }) {
  const t = (type || "").toLowerCase();
  if (t.includes("pdf")) return <FileText className="w-4 h-4 text-red-400" />;
  if (t.includes("image")) return <FileText className="w-4 h-4 text-blue-400" />;
  return <FileText className="w-4 h-4 text-neutral-400" />;
}

// ─── Document row (table mode) ────────────────────────────────────────────────

function DocRow({ doc, onDownload }: { doc: any; onDownload: (doc: any) => void }) {
  return (
    <TableRow className="border-neutral-800 hover:bg-neutral-800/50">
      <TableCell>
        <div className="flex items-center gap-2">
          <FileIcon type={doc.file_type} />
          <span className="text-sm font-medium">{doc.name}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {doc.linked_record_type || "—"}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">V{doc.version}</Badge>
      </TableCell>
      <TableCell className="text-sm text-neutral-400">
        {doc.uploaded_by_id?.name || doc.uploaded_by_id?.email || "—"}
      </TableCell>
      <TableCell className="text-sm text-neutral-400">
        {doc.createdAt
          ? new Date(doc.createdAt).toLocaleDateString()
          : "—"}
      </TableCell>
      <TableCell className="text-sm">
        <div className="flex items-center gap-1 text-neutral-400">
          <Download className="w-3 h-3" />
          {doc.download_count}
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant={doc.is_archived ? "secondary" : "default"}
          className="text-xs"
        >
          {doc.is_archived ? "Archived" : "Active"}
        </Badge>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onDownload(doc)}
        >
          Download
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [recordFilter, setRecordFilter] = useState<RecordFilter>("All");
  const [showArchived, setShowArchived] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (recordFilter !== "All") params.set("linked_record_type", recordFilter);
    if (showArchived) params.set("include_archived", "true");

    const res = await fetch(`/api/crm/documents?${params}`);
    const data = await res.json();
    if (data.success) setDocs(data.data.documents || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, recordFilter, showArchived]);

  const handleDownload = async (doc: any) => {
    await fetch(`/api/crm/documents/${doc._id}`);
    window.open(doc.file_url, "_blank");
    toast.success("Download started.");
    // Refresh to update download count
    fetchDocs();
  };

  // ── Metrics ────────────────────────────────────────────────────────────────
  const activeDocs = docs.filter((d) => !d.is_archived);
  const archivedDocs = docs.filter((d) => d.is_archived);
  const totalDownloads = docs.reduce((a, d) => a + (d.download_count || 0), 0);

  const byType: Record<string, number> = {};
  docs.forEach((d) => {
    const t = d.linked_record_type || "Unknown";
    byType[t] = (byType[t] || 0) + 1;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Document Management</h1>
          <p className="text-sm text-neutral-400 mt-1">
            All documents across Leads, Accounts, Opportunities, Quotes, Contracts, and Cases
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <p className="text-xs text-neutral-400 mb-1">Total Documents</p>
          <p className="text-2xl font-bold">{docs.length}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <p className="text-xs text-neutral-400 mb-1">Active</p>
          <p className="text-2xl font-bold text-green-400">{activeDocs.length}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <p className="text-xs text-neutral-400 mb-1">Archived</p>
          <p className="text-2xl font-bold text-neutral-400">{archivedDocs.length}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <p className="text-xs text-neutral-400 mb-1">Total Downloads</p>
          <p className="text-2xl font-bold text-blue-400">{totalDownloads}</p>
        </div>
      </div>

      {/* By type breakdown */}
      {Object.keys(byType).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(byType).map(([type, count]) => (
            <div
              key={type}
              className="bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs"
            >
              <span className="text-neutral-400">{type}:</span>{" "}
              <span className="font-bold">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search document name..."
            className="pl-9 bg-neutral-900 border-neutral-700"
          />
        </div>

        {/* Record type filter */}
        <div className="flex gap-1 flex-wrap">
          {RECORD_TYPES.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={recordFilter === t ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setRecordFilter(t)}
            >
              {t}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          variant="outline"
          className={`h-8 text-xs ${showArchived ? "border-yellow-700 text-yellow-400" : ""}`}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Hide Archived" : "Show Archived"}
        </Button>
      </div>

      {/* Document table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-neutral-800 hover:bg-transparent">
              <TableHead className="text-neutral-400">Name</TableHead>
              <TableHead className="text-neutral-400">Linked To</TableHead>
              <TableHead className="text-neutral-400">Version</TableHead>
              <TableHead className="text-neutral-400">Uploaded By</TableHead>
              <TableHead className="text-neutral-400">Date</TableHead>
              <TableHead className="text-neutral-400">Downloads</TableHead>
              <TableHead className="text-neutral-400">Status</TableHead>
              <TableHead className="text-neutral-400"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-neutral-500">
                  Loading documents...
                </TableCell>
              </TableRow>
            )}
            {!loading && docs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-neutral-500">
                  No documents found.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              docs.map((doc) => (
                <DocRow key={doc._id} doc={doc} onDownload={handleDownload} />
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
