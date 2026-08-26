'use client';

import { useEffect, useState, useCallback } from 'react';
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { financeSidebarConfig } from '@/config/sidebar/finance';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, User, Mail, Phone, Briefcase, Calendar, Edit2, Save, X, DollarSign } from 'lucide-react';
import { FullPageLoadingSkeleton } from '@/components/ui/loading-skeletons';

interface UserProfile {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  department?: string;
  employeeId?: string;
  designation?: string;
  status: string;
  dateOfJoining?: string;
  createdAt: string;
}

export default function FinanceProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    department: '',
    designation: '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      
      // Fetch current user's profile
      const res = await cachedFetch('/api/profile');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch profile');
      }

      const data = await res.json();
      
      if (data.user) {
        setProfile(data.user);
        setEditForm({
          name: data.user.name,
          phone: data.user.phone,
          department: data.user.department || '',
          designation: data.user.designation || '',
        });
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchProfile();
    }
  }, [status, router, fetchProfile]);

  const handleSaveProfile = async () => {
    if (!profile) return;

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await cachedFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update profile');
      }

      await fetchProfile();
      await update();
      setIsEditing(false);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await cachedFetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to change password');
      }

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setIsChangingPassword(false);
      setSuccess('Password changed successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error changing password:', err);
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsSaving(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (status === 'loading' || isLoading) {
    return <FullPageLoadingSkeleton />;
  }

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance Dashboard"
      pageName="My Profile"
      breadcrumbs={[
        { label: 'Dashboard', href: '/finance/summary' },
        { label: 'Profile' }
      ]}
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      onRefresh={fetchProfile}
      profilePath="/finance/profile"
    >
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold text-foreground dark:text-white">My Profile</h1>
          <p className="mt-2 text-muted-foreground dark:text-muted-foreground">
            Manage your account information and settings
          </p>
        </div>

        {/* Success/Error Messages */}
        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 rounded-none border border-emerald-200 dark:border-emerald-900">
            {success}
          </div>
        )}

        {/* Profile Header Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Avatar className="h-24 w-24">
                <AvatarFallback className="bg-foreground text-background text-2xl">
                  {profile ? getInitials(profile.name) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="text-center sm:text-left flex-1">
                <h2 className="text-2xl font-bold text-foreground dark:text-white">
                  {profile?.name}
                </h2>
                <p className="text-muted-foreground dark:text-muted-foreground mt-1">
                  {profile?.designation || (profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : '')}
                </p>
                <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                  <Badge className="bg-foreground text-background">
                    <DollarSign className="mr-1 h-3 w-3" />
                    {profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : ''}
                  </Badge>
                  <Badge
                    variant={profile?.status === 'active' ? 'default' : 'secondary'}
                    className={
                      profile?.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                    }
                  >
                    {profile?.status === 'active' ? 'Active' : 'Inactive'}
                  </Badge>
                  {profile?.employeeId && (
                    <Badge variant="outline">{profile.employeeId}</Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Information Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Your basic account details</CardDescription>
            </div>
            {!isEditing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    if (profile) {
                      setEditForm({
                        name: profile.name,
                        phone: profile.phone,
                        department: profile.department || '',
                        designation: profile.designation || '',
                      });
                    }
                    setError('');
                  }}
                  disabled={isSaving}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="bg-foreground hover:bg-foreground/90 text-background"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {isEditing ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (Read-only)</Label>
                  <Input
                    id="email"
                    value={profile?.email || ''}
                    disabled
                    className="bg-accent dark:bg-accent"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    placeholder="e.g., Finance"
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    value={editForm.designation}
                    onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                    placeholder="e.g., Financial Analyst"
                    disabled={isSaving}
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground">Full Name</p>
                    <p className="font-medium text-foreground dark:text-white">{profile?.name}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground">Email</p>
                    <p className="font-medium text-foreground dark:text-white">{profile?.email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground">Phone</p>
                    <p className="font-medium text-foreground dark:text-white">{profile?.phone}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground">Department</p>
                    <p className="font-medium text-foreground dark:text-white">
                      {profile?.department || 'Not specified'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground">Designation</p>
                    <p className="font-medium text-foreground dark:text-white">
                      {profile?.designation || 'Not specified'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground">Date of Joining</p>
                    <p className="font-medium text-foreground dark:text-white">
                      {profile?.dateOfJoining
                        ? new Date(profile.dateOfJoining).toLocaleDateString()
                        : 'Not specified'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Password Card */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Manage your password and security settings</CardDescription>
          </CardHeader>
          <CardContent>
            {!isChangingPassword ? (
              <Button
                variant="outline"
                onClick={() => setIsChangingPassword(true)}
              >
                Change Password
              </Button>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="newPassword">New Password *</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                      }
                      placeholder="Enter new password"
                      minLength={6}
                      disabled={isSaving}
                      required
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="confirmPassword">Confirm New Password *</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                      }
                      placeholder="Confirm new password"
                      minLength={6}
                      disabled={isSaving}
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsChangingPassword(false);
                      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                      setError('');
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSaving}
                    className="bg-foreground hover:bg-foreground/90 text-background"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Changing...
                      </>
                    ) : (
                      'Change Password'
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Additional account details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground dark:text-muted-foreground">Employee ID</span>
                <span className="font-medium text-foreground dark:text-white">
                  {profile?.employeeId || 'Not assigned'}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground dark:text-muted-foreground">Account Created</span>
                <span className="font-medium text-foreground dark:text-white">
                  {profile?.createdAt
                    ? new Date(profile.createdAt).toLocaleDateString()
                    : 'N/A'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
