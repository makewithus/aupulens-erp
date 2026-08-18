'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { AuthSplash } from '@/components/dashboard/AuthSplash';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Download, Upload, Eye, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
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
    window.open(doc.file_url, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = async (doc: DocumentRow) => {
    // Route through the API first so the download counter is accurate, then
    // open the real file — same UX as "Download" elsewhere in the app.
    try {
      await fetch(`/api/manufacturing/documents/${doc._id}`);
    } catch {
      /* counting is best-effort; still let the user download */
    }
    window.open(doc.file_url, '_blank', 'noopener,noreferrer');
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
      onSignOut={() => signOut({ callbackUrl: '/auth/manufacturing' })}
      onRefresh={fetchDocuments}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Documentation</h1>
            <p className="mt-2 text-muted-foreground">
              Manage shipping and customs documents
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
          />
          <Button onClick={handleUploadClick} disabled={uploading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload Document'}
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
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
              <div className="overflow-x-auto">
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
    </DashboardLayout>
  );
}
