'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { AuthSplash } from '@/components/dashboard/AuthSplash';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Activity, Search, FileText, Package } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cachedFetch } from "@/lib/api/cachedFetch";

interface ActivityLog {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  category: string;
}

export default function ActivityLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  // There's no dedicated audit-log table for manufacturing events — this
  // fetches a REAL feed synthesized server-side from the actual Shipment /
  // Customs Clearance / Freight Provider / HS Code / Document records (their
  // own timestamps), not a hardcoded placeholder list.
  const fetchActivities = useCallback(async () => {
    try {
      const res = await cachedFetch('/api/manufacturing/activity-logs');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setActivities(data.activities || []);
    } catch {
      toast({ title: 'Error', description: 'Failed to load activity logs', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const filteredActivities = activities.filter((activity) => {
    const matchesSearch =
      activity.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      filterCategory === 'all' || activity.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated') {
      fetchActivities();
    }
    // Any authenticated user (incl. admin / master-admin) may view this — the
    // old role gate bounced admins to /auth/manufacturing → admin dashboard.
  }, [status, router, session, fetchActivities]);

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
        return 'text-primary';
      case 'customs':
        return 'text-primary';
      case 'provider':
        return 'text-blue-600';
      case 'hscode':
        return 'text-purple-600';
      case 'document':
        return 'text-yellow-600';
      default:
        return 'text-muted-foreground';
    }
  };

  if (status === 'loading') {
    return <AuthSplash />;
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
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
      onRefresh={fetchActivities}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 min-w-0 max-w-full">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">Activity Logs</h1>
          <p className="mt-1 sm:mt-2 text-sm text-muted-foreground">
            Track recent shipment, customs, freight-provider, HS code, and document activity
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search activities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-48">
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
            {isLoading ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading activity…
              </div>
            ) : (
              <div className="space-y-4">
                {filteredActivities.length === 0 ? (
                  <div className="text-center p-8 text-muted-foreground">
                    No activities match your search criteria.
                  </div>
                ) : (
                  filteredActivities.map((activity) => {
                    const Icon = getCategoryIcon(activity.category);
                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-4 p-4 rounded-none border hover:bg-muted/50"
                      >
                        <div className={`p-2 rounded-none bg-muted ${getCategoryColor(activity.category)} shrink-0`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-3">
                            <div className="min-w-0">
                              <h3 className="font-medium text-foreground break-words">
                                {activity.action}
                              </h3>
                              <p className="text-sm text-muted-foreground mt-1 break-words">
                                {activity.description}
                              </p>
                            </div>
                            <div className="text-xs sm:text-sm text-muted-foreground text-left sm:text-right shrink-0">
                              {new Date(activity.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
