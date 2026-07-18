'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Download, Upload, Eye } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Document {
  _id: string;
  name: string;
  type: string;
  size: string;
  uploadedDate: string;
  shipmentId?: string;
}

export default function DocumentationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [documents] = useState<Document[]>([
    {
      _id: '1',
      name: 'Commercial Invoice - SH001.pdf',
      type: 'Commercial Invoice',
      size: '245 KB',
      uploadedDate: '2024-01-15',
      shipmentId: 'SH001',
    },
    {
      _id: '2',
      name: 'Packing List - SH002.pdf',
      type: 'Packing List',
      size: '189 KB',
      uploadedDate: '2024-01-14',
      shipmentId: 'SH002',
    },
    {
      _id: '3',
      name: 'Bill of Lading - SH003.pdf',
      type: 'Bill of Lading',
      size: '312 KB',
      uploadedDate: '2024-01-13',
      shipmentId: 'SH003',
    },
  ]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated' && session?.user?.role !== 'manufacturing') {
      router.push('/auth/manufacturing');
    }
  }, [status, router, session]);

  const handleUpload = () => {
    toast({
      title: 'Coming Soon',
      description: 'Document upload functionality will be available soon',
    });
  };

  const handleDownload = (docName: string) => {
    toast({
      title: 'Download Started',
      description: `Downloading ${docName}`,
    });
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-800" />
      </div>
    );
  }

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
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Documentation</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Manage shipping and customs documents
            </p>
          </div>
          <Button onClick={handleUpload} className="bg-blue-800 hover:bg-blue-700 text-white">
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Documents
              </CardTitle>
              <FileText className="h-4 w-4 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{documents.length}</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All uploaded files</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Recent Uploads
              </CardTitle>
              <Upload className="h-4 w-4 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">3</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Last 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Storage Used
              </CardTitle>
              <Download className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">746 KB</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Of 100 MB</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="border-b dark:border-gray-700">
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Document Name</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Type</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Size</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Shipment</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Uploaded</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc._id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <TableCell className="p-3 text-gray-900 dark:text-white font-medium">{doc.name}</TableCell>
                      <TableCell className="p-3 text-gray-600 dark:text-gray-400">{doc.type}</TableCell>
                      <TableCell className="p-3 text-gray-600 dark:text-gray-400">{doc.size}</TableCell>
                      <TableCell className="p-3 text-gray-600 dark:text-gray-400">{doc.shipmentId || 'N/A'}</TableCell>
                      <TableCell className="p-3 text-gray-600 dark:text-gray-400">
                        {new Date(doc.uploadedDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="p-3">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-800 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(doc.name)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
