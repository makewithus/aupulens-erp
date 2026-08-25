"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { masterAdminSidebarConfig } from "@/config/sidebar/master-admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, User, Mail, Shield, Calendar } from "lucide-react";
import { useEffect } from "react";

export default function MasterAdminProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/master");
    }
  }, [status, router]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted dark:bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const user = session?.user;

  return (
    <DashboardLayout
      sidebarSections={masterAdminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Global Control"
      pageName="Master Profile"
      breadcrumbs={[
        { label: "Master Admin", href: "/master-admin" },
        { label: "Profile" },
      ]}
      profilePath="/master-admin/profile"
      userName={user?.name || "Master"}
      userEmail={user?.email || ""}
      userRole="Master Admin"
      onSignOut={() => signOut({ callbackUrl: "/auth/master" })}
    >
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-black uppercase tracking-tighter text-primary">
            Master Profile
          </h1>
          <p className="text-sm font-bold text-muted-foreground uppercase opacity-60 tracking-wider">
            System Overseer Account Information
          </p>
        </div>

        {/* Profile Header Card */}
        <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
          <CardContent className="p-8">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <Avatar className="h-28 w-28 ring-4 ring-blue-500/20">
                <AvatarFallback className="bg-blue-600 text-white text-3xl font-black">
                  {user?.name ? getInitials(user.name) : "M"}
                </AvatarFallback>
              </Avatar>
              <div className="text-center sm:text-left flex-1 space-y-4">
                <div>
                  <h2 className="text-3xl font-black tracking-tight text-primary">
                    {user?.name}
                  </h2>
                  <p className="text-blue-500 font-bold uppercase text-xs tracking-widest mt-1">
                    Global System Administrator
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                  <Badge className="bg-blue-600 text-white font-black uppercase tracking-widest text-[10px] py-1 px-3 none-md border-0">
                    <Shield className="mr-2 h-3.5 w-3.5" />
                    Master Admin
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 font-black uppercase tracking-widest text-[10px] py-1 px-3 none-md"
                  >
                    Active Status
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profile Information Card */}
        <Card className="none-3xl border-2 shadow-xl">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-xl font-black uppercase tracking-tight">
              System Identity
            </CardTitle>
            <CardDescription className="font-bold text-[10px] uppercase tracking-widest opacity-60">
              Verified master account details
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-4 space-y-8">
            <div className="grid gap-8 sm:grid-cols-2">
              <div className="flex items-start gap-4 p-4 bg-muted/30 none-2xl border border-transparent hover:border-blue-500/20 transition-all">
                <User className="h-6 w-6 text-blue-500 mt-1" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                    Full Identity
                  </p>
                  <p className="font-black text-primary text-lg tracking-tight">
                    {user?.name}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-muted/30 none-2xl border border-transparent hover:border-blue-500/20 transition-all">
                <Mail className="h-6 w-6 text-blue-500 mt-1" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                    System Email
                  </p>
                  <p className="font-black text-primary text-lg tracking-tight truncate max-w-[250px]">
                    {user?.email}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-muted/30 none-2xl border border-transparent hover:border-blue-500/20 transition-all">
                <Shield className="h-6 w-6 text-blue-500 mt-1" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                    Access Level
                  </p>
                  <p className="font-black text-primary text-lg tracking-tight uppercase">
                    Tier 0 - Root Access
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-muted/30 none-2xl border border-transparent hover:border-blue-500/20 transition-all">
                <Calendar className="h-6 w-6 text-blue-500 mt-1" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">
                    Account Type
                  </p>
                  <p className="font-black text-primary text-lg tracking-tight uppercase">
                    Infrastructure Owner
                  </p>
                </div>
              </div>
            </div>

            <Separator className="bg-border/60" />

            <div className="p-6 bg-blue-500/5 border-2 border-dashed border-blue-500/20 none-3xl">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="h-5 w-5 text-blue-600" />
                <h4 className="font-black uppercase tracking-widest text-xs text-blue-600">
                  Administrative Note
                </h4>
              </div>
              <p className="text-xs font-bold text-muted-foreground leading-relaxed uppercase tracking-tight">
                This account holds absolute control over the ERP ecosystem.
                Profile modifications are restricted to the primary
                infrastructure configuration file for security purposes. If you
                need to change your master credentials, please contact the
                DevOps team.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
