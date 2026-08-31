'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { adminSidebarConfig } from '@/config/sidebar/admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateRangeFilter } from '@/components/shared/DateRangeFilter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Activity, Search, Filter } from 'lucide-react';
import { StatsRowSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';

interface ActivityLog {
  _id: string;
  userName: string;
  userEmail: string;
  userRole: string;
  activity: string;
  details?: string;
  ipAddress?: string;
  timestamp: string;
}

export default function ActivityLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ActivityLog[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (status === "authenticated") {
      if (!["admin", "master-admin"].includes((session?.user as any)?.role)) {
        router.push('/auth/admin');
      } else {
        fetchLogs();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, router]);

  useEffect(() => {
    if (status === 'authenticated') fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ limit: '200' });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await fetch(`/api/activity-logs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch logs');

      const data = await res.json();
      setLogs(data.logs);
      setFilteredLogs(data.logs);
      setTotalLogs(data.total ?? data.logs.length);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let filtered = logs;

    if (roleFilter !== 'all') {
      filtered = filtered.filter((log) => log.userRole === roleFilter);
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (log) =>
          log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.activity.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredLogs(filtered);
  }, [searchTerm, roleFilter, logs]);

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
      finance: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
      hr: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
      sales: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
      inventory: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
      project: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100',
      manufacturing: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100',
    };
    return colors[role] || 'bg-accent text-foreground dark:bg-accent dark:text-foreground';
  };

  if (status === 'loading') {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin Dashboard"
        pageName="Activity Logs"
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Activity Logs' }
        ]}
        profilePath="/admin/profile"
        userName="Admin"
        userEmail=""
        userRole="admin"
        onSignOut={() => signOut({ callbackUrl: '/auth/admin' })}
      >
        <div className="space-y-6">
          <div>
            <div className="h-9 w-64 bg-muted animate-pulse rounded mb-2" />
            <div className="h-5 w-96 bg-muted animate-pulse rounded" />
          </div>
          <StatsRowSkeleton count={3} />
          <Card>
            <CardHeader>
              <div className="h-6 w-32 bg-muted animate-pulse rounded mb-2" />
              <div className="h-4 w-48 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 h-10 bg-muted animate-pulse rounded" />
                <div className="w-full sm:w-48 h-10 bg-muted animate-pulse rounded" />
                <div className="w-32 h-10 bg-muted animate-pulse rounded" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="h-6 w-40 bg-muted animate-pulse rounded mb-2" />
              <div className="h-4 w-64 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <TableSkeleton rows={10} columns={6} />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin Dashboard"
        pageName="Activity Logs"
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Activity Logs' }
        ]}
        profilePath="/admin/profile"
        userName={session?.user?.name || ''}
        userEmail={session?.user?.email || ''}
        userRole={session?.user?.role}
        onSignOut={() => signOut({ callbackUrl: '/auth/admin' })}
        onRefresh={fetchLogs}
      >
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground dark:text-white">Activity Logs</h1>
            <p className="mt-2 text-muted-foreground dark:text-muted-foreground">
              Monitor all user activities across the system
            </p>
          </div>
          <StatsRowSkeleton count={3} />
          <Card>
            <CardContent className="pt-6">
              <TableSkeleton rows={10} columns={6} />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin Dashboard"
      pageName="Activity Logs"
      breadcrumbs={[
        { label: 'Dashboard', href: '/admin/dashboard' },
        { label: 'Activity Logs' }
      ]}
      profilePath="/admin/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/admin' })}
      onRefresh={fetchLogs}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground dark:text-white">Activity Logs</h1>
          <p className="mt-2 text-muted-foreground dark:text-muted-foreground">
            Monitor all user activities across the system
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Activities</CardTitle>
              <Activity className="h-4 w-4 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLogs}</div>
              <p className="text-xs text-muted-foreground">All recorded activities</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Filtered Results</CardTitle>
              <Filter className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredLogs.length}</div>
              <p className="text-xs text-muted-foreground">Based on current filters</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{"Today's Activities"}</CardTitle>
              <Activity className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {
                  logs.filter(
                    (log) =>
                      new Date(log.timestamp).toDateString() === new Date().toDateString()
                  ).length
                }
              </div>
              <p className="text-xs text-muted-foreground">Activities today</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search and filter activity logs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or activity..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                </SelectContent>
              </Select>
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
              />
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setRoleFilter('all');
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Activity Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
            <CardDescription>Detailed log of all user activities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-none border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No activity logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => (
                      <TableRow key={log._id}>
                        <TableCell className="font-mono text-xs">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{log.userName}</div>
                            <div className="text-xs text-muted-foreground">{log.userEmail}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getRoleBadgeColor(log.userRole)}>
                            {log.userRole.charAt(0).toUpperCase() + log.userRole.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{log.activity}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.details || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.ipAddress || '-'}
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
