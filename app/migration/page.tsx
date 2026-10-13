"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { toast } from "sonner";
import {
  DatabaseZap,
  Upload,
  Loader2,
  ChevronRight,
  Plus,
  File
} from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

const SOURCE_SYSTEMS = [
  { value: "tally", label: "Tally Prime" },
  { value: "zoho", label: "Zoho" },
  { value: "sap_b1", label: "SAP Business One" },
  { value: "netsuite", label: "Oracle NetSuite" },
  { value: "dynamics", label: "MS Dynamics" },
  { value: "erpnext", label: "ERPNext" },
  { value: "odoo", label: "Odoo" },
  { value: "busy", label: "Busy" },
  { value: "marg", label: "Marg ERP" },
  { value: "quickbooks", label: "QuickBooks" },
  { value: "excel", label: "Excel / CSV" },
  { value: "json", label: "JSON" },
  { value: "xml", label: "XML" },
  { value: "other", label: "Other" },
];

const UPLOAD_CHUNK_BYTES = 700 * 1024;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const blockSize = 0x8000;
  for (let i = 0; i < bytes.length; i += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + blockSize));
  }
  return btoa(binary);
}

async function postMigrationUpload(payload: Record<string, unknown>) {
  const res = await fetch("/api/migration/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const message = res.status === 413
      ? "This migration upload is too large for a single request. Please try again; Aupulens will upload it in smaller parts."
      : json.message || "Upload failed";
    throw new Error(message);
  }
  return json;
}

export default function MigrationCenterPage() {
  const { data: session, status } = useSession();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  
  const [files, setFiles] = useState<File[]>([]);
  const [sourceSystem, setSourceSystem] = useState("tally");
  const router = useRouter();

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/migration/batches");
      const json = await res.json();
      if (json.success) setBatches(json.data);
    } catch {
      toast.error("Failed to load migration batches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const createBatch = async () => {
    if (files.length === 0) return toast.error("Choose at least one file or a ZIP to upload");
    setBusy(true);
    setUploadProgress(0);
    const uploadId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      const fileMeta = files.map((file) => ({
        name: file.name,
        size: file.size,
        totalChunks: Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_BYTES)),
      }));
      const totalChunks = fileMeta.reduce((sum, file) => sum + file.totalChunks, 0);
      let uploadedChunks = 0;

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        const totalFileChunks = fileMeta[fileIndex].totalChunks;
        for (let chunkIndex = 0; chunkIndex < totalFileChunks; chunkIndex += 1) {
          const start = chunkIndex * UPLOAD_CHUNK_BYTES;
          const end = Math.min(file.size, start + UPLOAD_CHUNK_BYTES);
          const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
          await postMigrationUpload({
            action: "uploadChunk",
            uploadId,
            sourceSystem,
            fileIndex,
            fileName: file.name,
            chunkIndex,
            totalChunks: totalFileChunks,
            byteLength: bytes.byteLength,
            data: bytesToBase64(bytes),
          });
          uploadedChunks += 1;
          setUploadProgress(Math.round((uploadedChunks / Math.max(totalChunks, 1)) * 100));
        }
      }

      const json = await postMigrationUpload({
        action: "finalizeUpload",
        uploadId,
        sourceSystem,
        files: fileMeta,
      });
      
      toast.success(`Created migration batch with ${json.data.totalRecords} records`);
      router.push(`/migration/${json.data._id}`);
    } catch (error) {
      await postMigrationUpload({ action: "abortUpload", uploadId }).catch(() => {});
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  };

  if (status === "loading") return <AuthSplash />;

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      dashboardTitle="Admin"
      pageName="Data Migration Center"
      breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Migration Center" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={(session?.user as any)?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      onRefresh={loadBatches}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DatabaseZap className="h-6 w-6 text-emerald-500" /> Data Migration Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enterprise-grade asynchronous migration. Upload ZIP files or multiple data files.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4" /> Start New Migration
          </h2>
          <div className="grid gap-6 mt-2">
            <div>
              <label className="text-sm font-medium mb-2 block text-muted-foreground">Source ERP System</label>
              <select 
                className="border border-input rounded-md px-3 py-2 bg-background text-sm w-full md:w-64 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" 
                value={sourceSystem} 
                onChange={(e) => setSourceSystem(e.target.value)}
              >
                {SOURCE_SYSTEMS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block text-muted-foreground">Data Files</label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-500/40 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/60 cursor-pointer p-8 transition-all group w-full">
                <div className="flex flex-col items-center justify-center space-y-3 text-center">
                  <div className="p-4 bg-emerald-500/10 rounded-full group-hover:bg-emerald-500/20 transition-all group-hover:scale-110 transform duration-200 shadow-sm">
                    <Upload className="w-7 h-7 text-emerald-500" />
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-1">
                      <span className="text-emerald-500 font-semibold group-hover:underline">Click to choose files</span> or drag and drop them here
                    </div>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">Supports .csv, .xls, .xlsx, .json, .xml, or .zip</p>
                  </div>
                  
                  {files.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2 justify-center max-w-lg">
                      {files.map((file, i) => (
                         <div key={i} className="text-xs font-medium text-emerald-700 bg-emerald-500/20 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border border-emerald-500/10">
                           <File className="w-3.5 h-3.5 opacity-70" />
                           <span className="truncate max-w-[150px]">{file.name}</span>
                         </div>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  multiple
                  accept=".csv,.tsv,.xls,.xlsx,.json,.xml,.zip"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) setFiles(Array.from(e.target.files));
                  }}
                />
              </label>
            </div>
          </div>
          <button
            onClick={createBatch}
            disabled={busy || files.length === 0}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} 
            {busy ? `Uploading ${uploadProgress}%` : "Upload & Start Analysis"}
          </button>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-4">Past & Active Migrations</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          ) : batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No migration batches found.</p>
          ) : (
            <ul className="space-y-2">
              {batches.map(batch => (
                <li key={batch._id}>
                  <button
                    onClick={() => router.push(`/migration/${batch._id}`)}
                    className="w-full text-left rounded-lg border p-4 hover:bg-accent flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Batch {batch._id.slice(-6)}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">{batch.status.toUpperCase()}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3">
                        <span>{format(new Date(batch.createdAt), "PPp")}</span>
                        <span>•</span>
                        <span>{batch.totalFiles} files</span>
                        <span>•</span>
                        <span>{batch.totalRecords} records</span>
                        <span>•</span>
                        <span className="capitalize">{batch.sourceSystem}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
