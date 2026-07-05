"use client";

import { useTenantStore } from "@/store/useTenantStore";
import {
  ShieldAlert,
  Mail,
  ExternalLink,
  Building2,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_ROOT_DOMAIN, SUPPORT_EMAIL } from "@/lib/config";

export default function TenantSuspendedView() {
  const { tenantId } = useTenantStore();

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Structural Accents */}
      <div className="absolute top-0 left-0 w-full h-1 bg-primary shadow-[0_0_20px_rgba(59,130,246,0.3)]" />
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] bg-size-[20px_20px] -z-10" />

      <div className="max-w-xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 none-lg mb-4">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              System Notification
            </span>
          </div>
          <h1 className="text-6xl font-black uppercase tracking-tighter text-foreground leading-[0.9]">
            Workspace <br />
            <span className="text-primary">Restricted</span>
          </h1>
        </div>

        <div className="none-3xl border-2 border-border/50 bg-white/50 dark:bg-[#0a0a0a]/50 backdrop-blur-xl p-8 space-y-6 relative overflow-hidden">
          {/* Technical Corner Accents */}
          <div className="absolute top-0 right-0 p-2 opacity-10">
            <ShieldAlert className="h-48 w-48 text-primary -mr-16 -mt-16 rotate-12" />
          </div>

          <div className="space-y-4 relative">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 none-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  Target Domain
                </p>
                <p className="text-lg font-bold tracking-tight">
                  {tenantId}.{APP_ROOT_DOMAIN}
                </p>
              </div>
            </div>

            <div className="h-0.5 w-full bg-linear-to-r from-primary/50 via-primary/10 to-transparent" />

            <div className="space-y-3">
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  <Activity className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-tight">
                    Status: Administrative Hold
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Access to this enterprise workspace has been temporarily
                    suspended by the global infrastructure controller.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="mt-1">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-tight">
                    Requirement: Verification
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Please contact your organization administrator or Aupulens
                    enterprise support to resolve pending billing or
                    configuration issues.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            className="h-14 none-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[11px] shadow-xl shadow-primary/20 group transition-all"
            onClick={() =>
              (window.location.href = `mailto:${SUPPORT_EMAIL}`)
            }
          >
            <Mail className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
            Contact support
          </Button>
          <Button
            variant="outline"
            className="h-14 none-xl border-2 border-foreground/10 hover:border-foreground/20 font-black uppercase tracking-widest text-[11px] group"
            onClick={() => (window.location.href = "/")}
          >
            <ExternalLink className="mr-2 h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            visit portal
          </Button>
        </div>

        <div className="pt-8 flex flex-col items-center gap-4">
          <div className="h-px w-24 bg-border" />
          <p className="text-[11px] uppercase font-black tracking-[0.3em] text-muted-foreground opacity-40">
            Aupulens Cloud Infrastructure • Professional ERP
          </p>
        </div>
      </div>
    </div>
  );
}
