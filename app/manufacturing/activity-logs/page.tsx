'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Activity, Search, User, FileText, Package } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface ActivityLog {
  _id: string;
  action: string;
  description: string;
  user: string;
  timestamp: string;
  category: string;
}

export default function ActivityLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [activities] = useState<ActivityLog[]>([
    {
      _id: '1',
      action: 'Shipment Created',
      description: 'New shipment SH001 created for delivery to New York',
      user: 'John Doe',
      timestamp: '2024-01-20T14:30:00',
      category: 'shipment',
    },
    {
      _id: '2',
      action: 'Customs Clearance Updated',
      description: 'Customs clearance CC-12345 status changed to cleared',
      user: 'Jane Smith',
      timestamp: '2024-01-20T13:15:00',
      category: 'customs',
    },
    {
      _id: '3',
      action: 'Freight Provider Added',
      description: 'New freight provider "Global Shipping Co." added to system',
      user: 'Admin',
      timestamp: '2024-01-20T11:45:00',
      category: 'provider',
    },
    {
      _id: '4',
      action: 'HS Code Created',
      description: 'HS Code 8517.62.00 added for Electronics category',
      user: 'John Doe',
      timestamp: '2024-01-20T10:20:00',
      category: 'hscode',
    },
    {
      _id: '5',
      action: 'Document Uploaded',
      description: 'Commercial Invoice uploaded for shipment SH001',
      user: 'Jane Smith',
      timestamp: '2024-01-20T09:00:00',
      category: 'document',
    },
  ]);

  const filteredActivities = activities.filter((activity) => {
    const matchesSearch =
      activity.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.user.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      filterCategory === 'all' || activity.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated' && session?.user?.role !== 'manufacturing') {
      router.push('/auth/manufacturing');
    }
  }, [status, router, session]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'shipment':
        return Package;
      case 'customs':
        return FileText;
      case 'provider':
        return Activity;
      case 'hscode':
        return FileText;
      case 'document':
        return FileText;
      default:
        return Activity;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'shipment':
        return 'text-blue-800';
      case 'customs':
        return 'text-blue-800';
      case 'provider':
        return 'text-blue-600';
      case 'hscode':
        return 'text-purple-600';
      case 'document':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
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
      pageName="Activity Logs"
      breadcrumbs={[
        { label: 'Manufacturing', href: '/manufacturing/dashboard' },
        { label: 'Activity Logs' },
      ]}
      profilePath="/manufacturing/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/manufacturing' })}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Activity Logs</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Track all system activities and changes
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search activities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="shipment">Shipments</SelectItem>
                  <SelectItem value="customs">Customs</SelectItem>
                  <SelectItem value="provider">Providers</SelectItem>
                  <SelectItem value="hscode">HS Codes</SelectItem>
                  <SelectItem value="document">Documents</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activities ({filteredActivities.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredActivities.length === 0 ? (
                <div className="text-center p-8 text-gray-500 dark:text-gray-400">
                  No activities match your search criteria.
                </div>
              ) : (
                filteredActivities.map((activity) => {
                  const Icon = getCategoryIcon(activity.category);
                  return (
                    <div
                      key={activity._id}
                      className="flex items-start gap-4 p-4 rounded-none border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className={`p-2 rounded-none bg-gray-100 dark:bg-gray-800 ${getCategoryColor(activity.category)}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium text-gray-900 dark:text-white">
                              {activity.action}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {activity.description}
                            </p>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 text-right">
                            {new Date(activity.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400">
                          <User className="h-3 w-3" />
                          <span>{activity.user}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
