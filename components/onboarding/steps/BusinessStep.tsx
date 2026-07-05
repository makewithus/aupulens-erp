"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2 } from "lucide-react";

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", 
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", 
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", 
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", 
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", 
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

const INDUSTRIES = [
  "Manufacturing", "Retail / E-commerce", "Wholesale & Distribution", "Services", 
  "Technology & Software", "Construction & Engineering", "Healthcare & Pharma", 
  "Education", "Financial Services", "Real Estate", "Logistics & Transport", 
  "Agriculture", "Food & Beverage", "Professional Services", "Other"
];

interface BusinessStepProps {
  form: {
    companyName: string;
    country: string;
    state: string;
    industry: string;
    isGstRegistered: boolean;
    agreeTerms: boolean;
  };
  errors: Record<string, string>;
  update: (field: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

export function BusinessStep({
  form,
  errors,
  update,
  onNext,
  onBack,
  isLoading = false,
}: BusinessStepProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-4">
        {/* Organization Name */}
        <div className="space-y-1">
          <Label htmlFor="companyName" className="font-mono text-[11px] text-muted-foreground/60">
            Organization Name<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="companyName"
            placeholder="Organization Name"
            value={form.companyName}
            onChange={(e) => update("companyName", e.target.value)}
            className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none"
          />
          {errors.companyName && (
            <p className="text-[11px] font-mono text-destructive mt-1">{errors.companyName}</p>
          )}
        </div>

        {/* Country & State */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <Label htmlFor="country" className="font-mono text-[11px] text-muted-foreground/60">
              Country<span className="text-destructive ml-0.5">*</span>
            </Label>
            <select
              id="country"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              className="w-full h-10 px-0 bg-transparent rounded-none border-0 border-b border-border text-sm text-foreground focus:outline-none focus:border-foreground transition-colors shadow-none cursor-pointer"
            >
              <option value="India" className="bg-background text-foreground">India</option>
              <option value="United States" className="bg-background text-foreground">United States</option>
              <option value="United Kingdom" className="bg-background text-foreground">United Kingdom</option>
              <option value="Singapore" className="bg-background text-foreground">Singapore</option>
              <option value="United Arab Emirates" className="bg-background text-foreground">United Arab Emirates</option>
            </select>
            {errors.country && (
              <p className="text-[11px] font-mono text-destructive mt-1">{errors.country}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="state" className="font-mono text-[11px] text-muted-foreground/60">
              State / UT<span className="text-destructive ml-0.5">*</span>
            </Label>
            <select
              id="state"
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
              className="w-full h-10 px-0 bg-transparent rounded-none border-0 border-b border-border text-sm text-foreground focus:outline-none focus:border-foreground transition-colors shadow-none cursor-pointer"
            >
              <option value="" className="bg-background text-foreground">Select State</option>
              {STATES.map((s) => (
                <option key={s} value={s} className="bg-background text-foreground">
                  {s}
                </option>
              ))}
            </select>
            {errors.state && (
              <p className="text-[11px] font-mono text-destructive mt-1">{errors.state}</p>
            )}
          </div>
        </div>

        {/* Industry */}
        <div className="space-y-1">
          <Label htmlFor="industry" className="font-mono text-[11px] text-muted-foreground/60">
            Industry Type<span className="text-destructive ml-0.5">*</span>
          </Label>
          <select
            id="industry"
            value={form.industry}
            onChange={(e) => update("industry", e.target.value)}
            className="w-full h-10 px-0 bg-transparent rounded-none border-0 border-b border-border text-sm text-foreground focus:outline-none focus:border-foreground transition-colors shadow-none cursor-pointer"
          >
            <option value="" className="bg-background text-foreground">Select Industry</option>
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind} className="bg-background text-foreground">
                {ind}
              </option>
            ))}
          </select>
          {errors.industry && (
            <p className="text-[11px] font-mono text-destructive mt-1">{errors.industry}</p>
          )}
        </div>

        {/* Regional Settings Section */}
        <div className="pt-4 border-t border-border/20 space-y-3">
          <h3 className="font-mono text-[11px] text-muted-foreground/60 uppercase tracking-wider">
            Regional Settings
          </h3>
          <div className="grid grid-cols-2 gap-y-2 text-xs font-mono">
            <span className="text-muted-foreground/60">Currency:</span>
            <span className="text-foreground text-right">INR - Indian Rupee</span>

            <span className="text-muted-foreground/60">Timezone:</span>
            <span className="text-foreground text-right">IST (GMT+5:30)</span>

            <span className="text-muted-foreground/60">Language:</span>
            <span className="text-foreground text-right">English</span>
          </div>
        </div>

        {/* GST Registration Checkbox */}
        <div className="pt-4 border-t border-border/20 space-y-4">
          <label htmlFor="isGstRegistered" className="flex items-start gap-3 cursor-pointer group">
            <input
              id="isGstRegistered"
              type="checkbox"
              checked={form.isGstRegistered}
              onChange={(e) => update("isGstRegistered", e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-foreground focus:ring-foreground bg-transparent cursor-pointer"
            />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors select-none">
              Is this business registered for GST?
            </span>
          </label>

          {/* Terms Checkbox */}
          <div className="space-y-1">
            <label htmlFor="agreeTerms" className="flex items-start gap-3 cursor-pointer group">
              <input
                id="agreeTerms"
                type="checkbox"
                checked={form.agreeTerms}
                onChange={(e) => update("agreeTerms", e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-foreground focus:ring-foreground bg-transparent cursor-pointer"
              />
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors select-none">
                I agree to the{" "}
                <a href="#" className="text-foreground underline underline-offset-4 hover:text-foreground/80">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="#" className="text-foreground underline underline-offset-4 hover:text-foreground/80">
                  Privacy Policy
                </a>
                .
              </span>
            </label>
            {errors.agreeTerms && (
              <p className="text-[11px] font-mono text-destructive mt-1">{errors.agreeTerms}</p>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6 border-t border-border/20">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="text-sm font-mono uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Back
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={isLoading}
          className="group inline-flex items-center gap-2 text-sm font-mono uppercase tracking-[0.2em] font-bold text-foreground transition-all duration-300 hover:text-foreground/80 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
              Launching...
            </>
          ) : (
            <>
              Get Started
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
