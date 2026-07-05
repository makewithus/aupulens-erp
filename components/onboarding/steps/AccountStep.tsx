"use client";

import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

interface AccountStepProps {
  form: {
    name: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
  };
  errors: Record<string, string>;
  update: (field: string, value: any) => void;
  onNext: () => void;
}

export function AccountStep({ form, errors, update, onNext }: AccountStepProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-4">
        {/* Full Name */}
        <div className="space-y-1">
          <Label htmlFor="name" className="font-mono text-[11px] text-muted-foreground/60">
            Full Name
          </Label>
          <Input
            id="name"
            placeholder="Rahul Sharma"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none"
          />
          {errors.name && (
            <p className="text-[11px] font-mono text-destructive mt-1">{errors.name}</p>
          )}
        </div>

        {/* Work Email */}
        <div className="space-y-1">
          <Label htmlFor="email" className="font-mono text-[11px] text-muted-foreground/60">
            Work Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="rahul@company.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none"
          />
          {errors.email && (
            <p className="text-[11px] font-mono text-destructive mt-1">{errors.email}</p>
          )}
        </div>

        {/* Phone Number */}
        <div className="space-y-1">
          <Label htmlFor="phone" className="font-mono text-[11px] text-muted-foreground/60">
            Phone Number
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+91 98765 43210"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none"
          />
          {errors.phone && (
            <p className="text-[11px] font-mono text-destructive mt-1">{errors.phone}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1">
          <Label htmlFor="password" className="font-mono text-[11px] text-muted-foreground/60">
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Min. 6 characters"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              className="h-10 pl-0 pr-10 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 w-full shadow-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 bottom-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-[11px] font-mono text-destructive mt-1">{errors.password}</p>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-1">
          <Label htmlFor="confirmPassword" className="font-mono text-[11px] text-muted-foreground/60">
            Confirm Password
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Re-enter password"
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            className="h-10 px-0 bg-transparent rounded-none border-0 border-b border-border focus-visible:ring-0 focus-visible:border-foreground transition-colors placeholder:text-muted-foreground/30 shadow-none"
          />
          {errors.confirmPassword && (
            <p className="text-[11px] font-mono text-destructive mt-1">{errors.confirmPassword}</p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6 border-t border-border/20">
        <Link
          href="/auth"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign in
        </Link>

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
