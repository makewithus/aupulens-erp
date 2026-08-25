'use client';

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  UploadCloud,
  Download,
  Eye,
  Archive,
  ArchiveRestore,
  FileText,
  FileImage,
  FileVideo,
  File,
  Search,
  X,
  Clock,
  ExternalLink,
  Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LinkedRecordType =
  | "Lead"
  | "Account"
  | "Contact"
  | "Opportunity"
  | "Quote"
  | "Contract"
  | "Case";

interface CrmDoc {
  _id: string;
  name: string;
  file_url: string;
  file_type?: string;
  version: number;
  parent_document_id?: string;
  linked_record_type?: string;
  linked_record_id?: string;
  uploaded_by_id?: { name?: string; email?: string } | null;
  is_archived: boolean;
  download_count: number;
  createdAt?: string;
}

interface DocumentManagerProps {
  linkedRecordId: string;
  linkedRecordType: LinkedRecordType;
  readOnly?: boolean;
}

// ─── File type icon ───────────────────────────────────────────────────────────

function FileIcon({ type }: { type?: string }) {
  const t = (type || "").toLowerCase();
  if (t.includes("image")) return <FileImage className="w-4 h-4 text-blue-400" />;
  if (t.includes("video")) return <FileVideo className="w-4 h-4 text-purple-400" />;
  if (t.includes("pdf")) return <FileText className="w-4 h-4 text-red-400" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

// ─── Upload modal (inline) ────────────────────────────────────────────────────

function UploadForm({
  linkedRecordId,
  linkedRecordType,
  parentDocumentId,
  onSuccess,
  onCancel,
}: {
  linkedRecordId: string;
  linkedRecordType: LinkedRecordType;
  parentDocumentId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileType, setFileType] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !fileUrl.trim()) {
      toast.error("Name and File URL are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/crm/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          file_url: fileUrl,
          file_type: fileType || undefined,
          linked_record_type: linkedRecordType,
          linked_record_id: linkedRecordId,
          parent_document_id: parentDocumentId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(parentDocumentId ? "New version uploaded!" : "Document uploaded!");
        onSuccess();
      } else {
        toast.error(data.message || "Upload failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 bg-background space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">
          {parentDocumentId ? "Upload New Version" : "Upload Document"}
        </h4>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground block mb-0.5">Document Name *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Project Proposal v2"
            className="h-8 text-sm bg-card border-border"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-0.5">File URL *</label>
          <Input
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="https://... or /uploads/..."
            className="h-8 text-sm bg-card border-border"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-0.5">File Type</label>
          <Input
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            placeholder="application/pdf, image/png..."
            className="h-8 text-sm bg-card border-border"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-primary"
          onClick={handleSubmit}
          disabled={saving}
        >
          <UploadCloud className="w-3 h-3 mr-1" />
          {saving ? "Uploading..." : "Upload"}
        </Button>
      </div>
    </div>
  );
}

// ─── Document row ─────────────────────────────────────────────────────────────

function DocRow({
  doc,
  onArchive,
  onNewVersion,
  showArchiveToggle,
}: {
  doc: CrmDoc;
  onArchive: (doc: CrmDoc) => void;
  onNewVersion: (doc: CrmDoc) => void;
  showArchiveToggle: boolean;
}) {
  const handleDownload = async () => {
    // Trigger download count increment via metadata fetch
    await fetch(`/api/crm/documents/${doc._id}`);
    window.open(doc.file_url, "_blank");
    toast.success("Download started");
  };

  const handlePreview = async () => {
    await fetch(`/api/crm/documents/${doc._id}?action=preview`);
    window.open(doc.file_url, "_blank");
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
        doc.is_archived
          ? "border-border bg-background/30 opacity-60"
          : "border-border bg-background hover:border-border"
      }`}
    >
      <FileIcon type={doc.file_type} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{doc.name}</span>
          <Badge variant="outline" className="text-xs shrink-0">
            V{doc.version}
          </Badge>
          {doc.is_archived && (
            <Badge variant="secondary" className="text-xs">
              Archived
            </Badge>
          )}
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
          {doc.uploaded_by_id && (
            <span>by {doc.uploaded_by_id.name || doc.uploaded_by_id.email}</span>
          )}
          {doc.createdAt && (
            <span className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {new Date(doc.createdAt).toLocaleDateString()}
            </span>
          )}
          <span>{doc.download_count} downloads</span>
        </div>
      </div>

      <div className="flex gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-blue-400"
          title="Preview"
          onClick={handlePreview}
        >
          <Eye className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-green-400"
          title="Download"
          onClick={handleDownload}
        >
          <Download className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-blue-400"
          title="New version"
          onClick={() => onNewVersion(doc)}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
        {showArchiveToggle && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${
              doc.is_archived
                ? "text-muted-foreground hover:text-green-400"
                : "text-muted-foreground hover:text-yellow-400"
            }`}
            title={doc.is_archived ? "Restore" : "Archive"}
            onClick={() => onArchive(doc)}
          >
            {doc.is_archived ? (
              <ArchiveRestore className="w-3.5 h-3.5" />
            ) : (
              <Archive className="w-3.5 h-3.5" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── DocumentManager ──────────────────────────────────────────────────────────

export default function DocumentManager({
  linkedRecordId,
  linkedRecordType,
  readOnly = false,
}: DocumentManagerProps) {
  const [docs, setDocs] = useState<CrmDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [newVersionOf, setNewVersionOf] = useState<CrmDoc | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      linked_record_id: linkedRecordId,
      linked_record_type: linkedRecordType,
      ...(showArchived ? { include_archived: "true" } : {}),
      ...(search ? { search } : {}),
    });
    const res = await fetch(`/api/crm/documents?${params}`);
    const data = await res.json();
    if (data.success) setDocs(data.data.documents || []);
    setLoading(false);
  }, [linkedRecordId, linkedRecordType, showArchived, search]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleArchive = async (doc: CrmDoc) => {
    const res = await fetch(`/api/crm/documents/${doc._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_archived: !doc.is_archived }),
    });
    if (res.ok) {
      toast.success(doc.is_archived ? "Document restored." : "Document archived.");
      fetchDocs();
    } else {
      toast.error("Action failed.");
    }
  };

  const activeDocs = docs.filter((d) => !d.is_archived);
  const archivedDocs = docs.filter((d) => d.is_archived);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="pl-8 h-8 text-sm bg-background border-border"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 text-xs ${showArchived ? "border-yellow-700 text-yellow-400" : ""}`}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Hide Archived" : "Show Archived"}
        </Button>
        {!readOnly && (
          <Button
            size="sm"
            className="h-8 bg-primary text-xs"
            onClick={() => {
              setNewVersionOf(null);
              setShowUpload(true);
            }}
          >
            <UploadCloud className="w-3.5 h-3.5 mr-1" />
            Upload
          </Button>
        )}
      </div>

      {/* Upload form */}
      {(showUpload || newVersionOf) && !readOnly && (
        <UploadForm
          linkedRecordId={linkedRecordId}
          linkedRecordType={linkedRecordType}
          parentDocumentId={newVersionOf?._id}
          onSuccess={() => {
            setShowUpload(false);
            setNewVersionOf(null);
            fetchDocs();
          }}
          onCancel={() => {
            setShowUpload(false);
            setNewVersionOf(null);
          }}
        />
      )}

      {/* Document list */}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : activeDocs.length === 0 && !showArchived ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
          No documents uploaded for this {linkedRecordType.toLowerCase()}.
        </div>
      ) : (
        <div className="space-y-2">
          {activeDocs.map((d) => (
            <DocRow
              key={d._id}
              doc={d}
              onArchive={handleArchive}
              onNewVersion={(doc) => {
                setNewVersionOf(doc);
                setShowUpload(false);
              }}
              showArchiveToggle={!readOnly}
            />
          ))}

          {showArchived && archivedDocs.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground pt-2 pb-1 border-t border-border">
                Archived ({archivedDocs.length})
              </div>
              {archivedDocs.map((d) => (
                <DocRow
                  key={d._id}
                  doc={d}
                  onArchive={handleArchive}
                  onNewVersion={(doc) => {
                    setNewVersionOf(doc);
                    setShowUpload(false);
                  }}
                  showArchiveToggle={!readOnly}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Stats */}
      {docs.length > 0 && (
        <div className="text-xs text-muted-foreground flex gap-4 pt-1">
          <span>{activeDocs.length} active</span>
          <span>{archivedDocs.length} archived</span>
          <span>
            {docs.reduce((a, d) => a + d.download_count, 0)} total downloads
          </span>
        </div>
      )}
    </div>
  );
}
