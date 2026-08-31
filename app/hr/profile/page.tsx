"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, User } from "lucide-react";

export default function HRProfilePage() {
  const { status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [formData, setFormData] = useState({ name: "", email: "", phone: "" });

  useEffect(() => {
    
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") loadProfile();
  }, [status]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setProfile(data.user);
        setFormData({
          name: data.user?.name || "",
          email: data.user?.email || "",
          phone: data.user?.phone || "",
        });
      }
    } catch {
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success("Profile updated");
        loadProfile();
      } else {
        toast.error("Update failed");
      }
    } catch {
      toast.error("Error updating profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordForm.newPassword }),
      });
      if (res.ok) {
        toast.success("Password changed");
        setIsChangingPassword(false);
        setPasswordForm({ newPassword: "", confirmPassword: "" });
      } else {
        toast.error("Password change failed");
      }
    } catch {
      toast.error("Error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account settings</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            {/* Personal Info */}
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={formData.email} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Input value={profile?.role || ""} disabled className="bg-muted capitalize" />
                    </div>
                  </div>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Changes"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Password */}
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Change your password</CardDescription>
              </CardHeader>
              <CardContent>
                {!isChangingPassword ? (
                  <Button variant="outline" onClick={() => setIsChangingPassword(true)}>Change Password</Button>
                ) : (
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>New Password</Label>
                        <Input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="Min 6 characters" minLength={6} required />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Confirm Password</Label>
                        <Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} placeholder="Confirm" minLength={6} required />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => { setIsChangingPassword(false); setPasswordForm({ newPassword: "", confirmPassword: "" }); }} disabled={isSaving}>Cancel</Button>
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Changing...</> : "Change Password"}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>

            {/* Account Info */}
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Employee ID</span>
                  <span className="font-medium">{profile?.employeeId || "Not assigned"}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Account Created</span>
                  <span className="font-medium">{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "N/A"}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Tenant</span>
                  <span className="font-medium font-mono">{profile?.tenantId || "N/A"}</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
  );
}
