'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { AuthSplash } from '@/components/dashboard/AuthSplash';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Download, Upload, Eye, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { confirmDialog } from '@/components/providers/ConfirmRoot';
import { uploadToCloudinary } from '@/lib/upload';

interface DocumentRow {
  _id: string;
  name: string;
  file_url: string;
  file_type: string;
  size: number;
  createdAt: string;
  download_count: number;
}

const friendlyType = (fileType: string, name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (fileType.includes('pdf') || ext === 'pdf') return 'PDF';
  if (fileType.includes('word') || ['doc', 'docx'].includes(ext)) return 'Word Document';
  if (fileType.includes('sheet') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'Spreadsheet';
  if (fileType.startsWith('image/')) return 'Image';
  return ext ? ext.toUpperCase() : 'File';
};

const formatSize = (bytes: number) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function DocumentationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [previewDocument, setPreviewDocument] = useState<DocumentRow | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/manufacturing/documents');
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch {
      toast({ title: 'Error', description: 'Failed to load documents', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated') {
      fetchDocuments();
    }
  }, [status, router, session, fetchDocuments]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      const res = await fetch('/api/manufacturing/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, file_url: url, file_type: file.type, size: file.size }),
      });
      if (!res.ok) throw new Error('Failed to save document');
      toast({ title: 'Uploaded', description: `${file.name} uploaded successfully` });
      fetchDocuments();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Please try again', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleView = async (doc: DocumentRow) => {
    setPreviewDocument(doc);
    setPreviewHtml('');
    setPreviewError('');
    const extension = doc.name.split('.').pop()?.toLowerCase();
    const isWordDocument = extension === 'docx' || (doc.file_type || '').includes('wordprocessingml.document');
    if (!isWordDocument) return;

    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/manufacturing/documents/${doc._id}?preview=1`);
      if (!res.ok) throw new Error('Could not retrieve this document for preview.');
      const arrayBuffer = await res.arrayBuffer();
      const mammoth = (await import('mammoth')).default;
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setPreviewHtml(result.value);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Preview is unavailable.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (doc: DocumentRow) => {
    // The API serves the file with Content-Disposition: attachment and records
    // the download. Opening file_url directly would make this identical to View.
    const link = document.createElement('a');
    link.href = `/api/manufacturing/documents/${doc._id}?download=1`;
    link.download = doc.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast({ title: 'Download started', description: doc.name });
  };

  const handleDelete = async (doc: DocumentRow) => {
    if (!(await confirmDialog({ title: `Delete "${doc.name}"?` }))) return;
    try {
      const res = await fetch(`/api/manufacturing/documents/${doc._id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete document');
      toast({ title: 'Deleted', description: doc.name });
      fetchDocuments();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete document', variant: 'destructive' });
    }
  };

  if (status === 'loading') {
    return <AuthSplash />;
  }

  const recentUploads = documents.filter((d) => Date.now() - new Date(d.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000).length;
  const totalBytes = documents.reduce((acc, d) => acc + (d.size || 0), 0);

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing"
      pageName="Documentation"
      breadcrumbs={[
        { label: 'Manufacturing', href: '/manufacturing/dashboard' },
        { label: 'Documentation' },
      ]}
      profilePath="/manufacturing/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
      onRefresh={fetchDocuments}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 min-w-0 max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground">Documentation</h1>
            <p className="mt-1 sm:mt-2 text-sm text-muted-foreground">
              Manage shipping and customs documents
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
          />
          <Button onClick={handleUploadClick} disabled={uploading} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground">
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload Document'}
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Documents
              </CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{documents.length}</div>
              <p className="text-xs text-muted-foreground mt-1">All uploaded files</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Recent Uploads
              </CardTitle>
              <Upload className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{recentUploads}</div>
              <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Storage Used
              </CardTitle>
              <Download className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{formatSize(totalBytes)}</div>
              <p className="text-xs text-muted-foreground mt-1">Across all documents</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Documents</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="p-8 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading documents…
              </div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No documents uploaded yet. Click <span className="font-medium">Upload Document</span> to add one.
              </div>
            ) : (
              <div className="overflow-x-auto w-full min-w-0">
                <Table className="w-full min-w-[720px]">
                  <TableHeader>
                    <TableRow className="border-b">
                      <TableHead className="text-left p-3 font-medium whitespace-nowrap">Document Name</TableHead>
                      <TableHead className="text-left p-3 font-medium whitespace-nowrap">Type</TableHead>
                      <TableHead className="text-left p-3 font-medium whitespace-nowrap">Size</TableHead>
                      <TableHead className="text-left p-3 font-medium whitespace-nowrap">Uploaded</TableHead>
                      <TableHead className="text-left p-3 font-medium whitespace-nowrap">Downloads</TableHead>
                      <TableHead className="text-left p-3 font-medium whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc._id} className="border-b hover:bg-muted/50">
                        <TableCell className="p-3 text-foreground font-medium">{doc.name}</TableCell>
                        <TableCell className="p-3 text-muted-foreground">{friendlyType(doc.file_type, doc.name)}</TableCell>
                        <TableCell className="p-3 text-muted-foreground">{formatSize(doc.size)}</TableCell>
                        <TableCell className="p-3 text-muted-foreground">
                          {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="p-3 text-muted-foreground">{doc.download_count || 0}</TableCell>
                        <TableCell className="p-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleView(doc)} title="View">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDownload(doc)} title="Download">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(doc)} title="Delete" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!previewDocument} onOpenChange={(open) => { if (!open) setPreviewDocument(null); }}>
        <DialogContent className="w-[min(96vw,1100px)] max-w-none h-[min(90vh,850px)] flex flex-col">
          <DialogHeader>
            <DialogTitle className="pr-8 truncate">{previewDocument?.name || 'Document preview'}</DialogTitle>
            <DialogDescription>Preview only. Use the download button to save a copy.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded border border-border bg-background">
            {previewLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Preparing preview…
              </div>
            ) : previewError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
                <p>{previewError}</p>
                <Button onClick={() => previewDocument && handleDownload(previewDocument)}>
                  <Download className="mr-2 h-4 w-4" /> Download document
                </Button>
              </div>
            ) : previewDocument && ((previewDocument.file_type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(previewDocument.name)) ? (
              <div className="relative h-full min-h-[60vh] w-full">
                <Image
                  src={`/api/manufacturing/documents/${previewDocument._id}?preview=1`}
                  alt={previewDocument.name}
                  fill
                  unoptimized
                  sizes="96vw"
                  className="object-contain p-4"
                />
              </div>
            ) : previewDocument && ((previewDocument.file_type || '').includes('pdf') || previewDocument.name.toLowerCase().endsWith('.pdf')) ? (
              <iframe
                title={`Preview of ${previewDocument.name}`}
                src={`/api/manufacturing/documents/${previewDocument._id}?preview=1`}
                className="h-full min-h-[60vh] w-full"
              />
            ) : previewHtml ? (
              <iframe
                title={`Preview of ${previewDocument?.name || 'Word document'}`}
                sandbox=""
                srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Arial,sans-serif;line-height:1.6;max-width:850px;margin:40px auto;padding:0 24px;color:#222}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #aaa;padding:6px}</style></head><body>${previewHtml}</body></html>`}
                className="h-full min-h-[60vh] w-full bg-white"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8 opacity-50" />
                <p>Preview is not available for this file type.</p>
                <Button onClick={() => previewDocument && handleDownload(previewDocument)}>
                  <Download className="mr-2 h-4 w-4" /> Download document
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
