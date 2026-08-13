'use client';
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Search, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface HSCode {
  _id: string;
  hsCode: string;
  description: string;
  category: string;
  restrictions?: string;
}

export default function HSCodesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [hsCodes, setHsCodes] = useState<HSCode[]>([]);
  const [filteredCodes, setFilteredCodes] = useState<HSCode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    hsCode: '',
    description: '',
    category: '',
    restrictions: '',
  });

  useEffect(() => {
    if (searchQuery) {
      const filtered = hsCodes.filter(
        (item) =>
          item.hsCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredCodes(filtered);
    } else {
      setFilteredCodes(hsCodes);
    }
  }, [searchQuery, hsCodes]);

  const fetchHSCodes = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/manufacturing/hs-codes');
      const data = await res.json();
      setHsCodes(data.hsCodes || []);
      setFilteredCodes(data.hsCodes || []);
    } catch (err) {
      console.error('Error fetching HS codes:', err);
      toast({
        title: 'Error',
        description: 'Failed to fetch HS codes',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (status === "authenticated") {
      if (session?.user?.role !== 'manufacturing') {
        router.push('/auth/manufacturing');
      } else {
        fetchHSCodes();
      }
    }
  }, [fetchHSCodes, router, session, status]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/manufacturing/hs-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'HS Code created successfully',
        });
        setIsCreateOpen(false);
        setFormData({
          hsCode: '',
          description: '',
          category: '',
          restrictions: '',
        });
        fetchHSCodes();
      } else {
        throw new Error('Failed to create HS code');
      }
    } catch (err) {
      console.error('Error creating HS code:', err);
      toast({
        title: 'Error',
        description: 'Failed to create HS code',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: 'Are you sure you want to delete this HS code?' })) return;
    
    try {
      const res = await fetch(`/api/manufacturing/hs-codes/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'HS Code deleted successfully',
        });
        fetchHSCodes();
      } else {
        throw new Error('Failed to delete HS code');
      }
    } catch (err) {
      console.error('Error deleting HS code:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete HS code',
        variant: 'destructive',
      });
    }
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
      pageName="HS Code Management"
      breadcrumbs={[
        { label: 'Manufacturing', href: '/manufacturing/dashboard' },
        { label: 'HS Codes' },
      ]}
      profilePath="/manufacturing/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/manufacturing' })}
      onRefresh={fetchHSCodes}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">HS Code Management</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Harmonized System codes for product classification
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-800 hover:bg-blue-700 text-white">
                <Plus className="mr-2 h-4 w-4" />
                Add HS Code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New HS Code</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="hsCode">HS Code *</Label>
                    <Input
                      id="hsCode"
                      placeholder="e.g., 8517.62.00"
                      value={formData.hsCode}
                      onChange={(e) => setFormData({ ...formData, hsCode: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <Input
                      id="category"
                      placeholder="e.g., Electronics"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Description *</Label>
                  <textarea
                    id="description"
                    placeholder="Detailed description of the product"
                    value={formData.description}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
                    required
                    rows={3}
                    className="flex min-h-20 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div>
                  <Label htmlFor="restrictions">Restrictions (Optional)</Label>
                  <textarea
                    id="restrictions"
                    placeholder="Any import/export restrictions"
                    value={formData.restrictions}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, restrictions: e.target.value })}
                    rows={2}
                    className="flex min-h-16 w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-800 hover:bg-blue-700">
                    Add HS Code
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by code, description, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>HS Codes ({filteredCodes.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="border-b dark:border-gray-700">
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">HS Code</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Category</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Description</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Restrictions</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCodes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center p-8 text-gray-500 dark:text-gray-400">
                        {searchQuery ? 'No HS codes match your search.' : 'No HS codes found. Add your first HS code to get started.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCodes.map((hsCode) => (
                      <TableRow key={hsCode._id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableCell className="p-3 text-gray-900 dark:text-white font-medium">{hsCode.hsCode}</TableCell>
                        <TableCell className="p-3 text-gray-600 dark:text-gray-400">{hsCode.category}</TableCell>
                        <TableCell className="p-3 text-gray-600 dark:text-gray-400 max-w-md truncate">{hsCode.description}</TableCell>
                        <TableCell className="p-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                          {hsCode.restrictions || 'None'}
                        </TableCell>
                        <TableCell className="p-3">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-800 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(hsCode._id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
