"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";

interface OrganizationStepProps {
  form: {
    companyName: string;
    subdomain: string;
  };
  errors: Record<string, string>;
  update: (field: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
}

export function OrganizationStep({
  form,
  errors,
  update,
  onNext,
  onBack,
}: OrganizationStepProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-4">
        {/* Company Name */}
        <div className="space-y-1">
          <Label htmlFor="companyName" className="font-mono text-[11px] text-muted-foreground/60">
            Company / Organization Name
          </Label>
          <Input
            id="companyName"
            placeholder="Acme Private Limited"
            value={form.companyName}
            onChange={(e) => update("companyName", e.target.value)}
            className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none"
          />
          {errors.companyName && (
            <p className="text-[11px] font-mono text-destructive mt-1">{errors.companyName}</p>
          )}
        </div>

        {/* Subdomain */}
        <div className="space-y-1">
          <Label htmlFor="subdomain" className="font-mono text-[11px] text-muted-foreground/60">
            Organization Subdomain
          </Label>
          <div className="flex items-center border-0 border-b border-border focus-within:border-foreground transition-colors">
            <Input
              id="subdomain"
              placeholder="acme"
              value={form.subdomain}
              onChange={(e) =>
                update("subdomain", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
              }
              className="h-10 px-0 bg-transparent rounded-none border-0 focus-visible:ring-0 focus-visible:border-0 flex-1 font-mono text-sm shadow-none"
            />
            <span className="font-mono text-xs text-muted-foreground/40 pr-1">
              .aupulens.online
            </span>
          </div>
          {errors.subdomain && (
            <p className="text-[11px] font-mono text-destructive mt-1">{errors.subdomain}</p>
          )}
          <p className="text-[11px] text-muted-foreground/60 mt-1.5">
            Your team will access ERP at{" "}
            <span className="font-semibold text-foreground">
              {form.subdomain || "yourcompany"}.aupulens.online
            </span>
          </p>
        </div>

        {/* Starter Plan Note */}
        <div className="pt-2 font-mono">
          <p className="text-xs font-bold uppercase tracking-wider text-foreground">Starter Plan</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Included with your free trial.</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6 border-t border-border/20">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-mono uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
        >
          Back
        </button>

        <button
          type="button"
          onClick={onNext}
          className="group inline-flex items-center gap-2 text-sm font-mono uppercase tracking-[0.2em] font-bold text-foreground transition-all duration-300 hover:text-foreground/80"
        >
          Continue
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
}
