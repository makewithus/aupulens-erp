"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  Eye, EyeOff, CheckCircle2, ArrowRight, Loader2,
  Building2, BarChart3, Users, Package, ShieldCheck, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "next-auth/react";

const FEATURES = [
  { icon: BarChart3, label: "Finance & Accounting", desc: "Invoices, P&L, Balance Sheet, GST" },
  { icon: Users, label: "HR & Payroll", desc: "Employees, leaves, salary slips" },
  { icon: Package, label: "Inventory & WMS", desc: "Stock moves, warehouses, valuation" },
  { icon: Building2, label: "CRM & Sales", desc: "Leads, quotations, sales orders" },
];

const TIERS = [
  { name: "Starter", price: "Free", users: "Up to 3 users", highlight: false },
  { name: "Growth", price: "₹1,499/mo", users: "Up to 15 users", highlight: true },
  { name: "Enterprise", price: "Custom", users: "Unlimited users", highlight: false },
];

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    companyName: "",
    subdomain: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-generate subdomain from company name
  useEffect(() => {
    if (form.companyName && step === 2) {
      const slug = form.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      setForm((prev) => ({ ...prev, subdomain: slug }));
    }
  }, [form.companyName, step]);

  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Full name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Invalid email";
    if (!form.phone.trim()) errs.phone = "Phone number is required";
    if (!form.password) errs.password = "Password is required";
    else if (form.password.length < 6) errs.password = "Min 6 characters";
    if (form.password !== form.confirmPassword) errs.confirmPassword = "Passwords do not match";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    if (!form.companyName.trim()) errs.companyName = "Company name is required";
    if (!form.subdomain.trim()) errs.subdomain = "Subdomain is required";
    else if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(form.subdomain))
      errs.subdomain = "Use only lowercase letters, numbers, and hyphens";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep1()) setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep2()) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          companyName: form.companyName,
          subdomain: form.subdomain,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      toast.success("Account created! Signing you in…");
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        tenantId: form.subdomain,
        redirect: false,
      });
      if (result?.ok) {
        router.push("/");
      } else {
        router.push("/auth/admin");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-950">
      {/* ── Left Panel ── */}
      <div className="hidden lg:flex lg:w-[52%] flex-col bg-gradient-to-br from-[#1a237e] via-[#283593] to-[#1565c0] relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-[-120px] right-[-120px] w-[380px] h-[380px] rounded-full bg-white/5" />
        <div className="absolute bottom-[-80px] left-[-80px] w-[260px] h-[260px] rounded-full bg-white/5" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-white/3" />

        <div className="relative z-10 flex flex-col justify-between h-full px-16 py-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-white text-xl font-semibold tracking-tight">Aupulens</span>
          </div>

          {/* Hero */}
          <div className="space-y-10">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-xs font-medium">
                <ShieldCheck className="h-3.5 w-3.5" /> Trusted by 2,000+ businesses
              </div>
              <h1 className="text-4xl font-bold text-white leading-tight">
                One platform for your entire business
              </h1>
              <p className="text-blue-100 text-base leading-relaxed max-w-md">
                Finance, HR, Inventory, CRM — all connected. Built for Indian SMEs, startups, and enterprises.
              </p>
            </div>

            {/* Feature grid */}
            <div className="grid grid-cols-2 gap-4">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 p-4 rounded-xl bg-white/10 backdrop-blur-sm">
                  <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">{label}</p>
                    <p className="text-blue-200 text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pricing tiers */}
            <div className="space-y-2">
              <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider">Transparent pricing</p>
              <div className="flex gap-3">
                {TIERS.map((t) => (
                  <div
                    key={t.name}
                    className={`flex-1 p-3 rounded-xl border ${
                      t.highlight
                        ? "bg-white text-[#1a237e] border-white"
                        : "bg-white/10 text-white border-white/20"
                    }`}
                  >
                    <p className="text-xs font-bold">{t.name}</p>
                    <p className={`text-base font-extrabold mt-1 ${t.highlight ? "text-[#1565c0]" : ""}`}>{t.price}</p>
                    <p className="text-[11px] mt-0.5 opacity-70">{t.users}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-blue-300 text-xs">© 2026 Aupulens Technologies. All rights reserved.</p>
        </div>
      </div>

      {/* ── Right Panel: Form ── */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-16 xl:px-24">
        {/* Mobile logo */}
        <div className="lg:hidden mb-10 flex items-center gap-2">
          <Zap className="h-6 w-6 text-blue-700" />
          <span className="text-xl font-semibold text-gray-900 dark:text-white">Aupulens</span>
        </div>

        <div className="max-w-[420px] w-full mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {step === 1 ? "Create your account" : "Set up your organization"}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {step === 1
                ? "Start your free 14-day trial. No credit card required."
                : "You're almost there! Tell us about your company."}
            </p>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mt-4">
              {[1, 2].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      step >= s
                        ? "bg-blue-700 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                    }`}
                  >
                    {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
                  </div>
                  {s < 2 && <div className={`h-px w-10 ${step > s ? "bg-blue-700" : "bg-gray-200 dark:bg-gray-700"}`} />}
                </div>
              ))}
              <span className="ml-1 text-xs text-gray-400">Step {step} of 2</span>
            </div>
          </div>

          <form onSubmit={step === 1 ? (e) => { e.preventDefault(); handleNext(); } : handleSubmit}>
            {step === 1 ? (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Full Name</Label>
                  <Input
                    className="mt-1.5 h-11"
                    placeholder="Rahul Sharma"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Work Email</Label>
                  <Input
                    className="mt-1.5 h-11"
                    type="email"
                    placeholder="rahul@company.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Phone Number</Label>
                  <Input
                    className="mt-1.5 h-11"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                  />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Password</Label>
                  <div className="relative mt-1.5">
                    <Input
                      className="h-11 pr-10"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 6 characters"
                      value={form.password}
                      onChange={(e) => update("password", e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Confirm Password</Label>
                  <Input
                    className="mt-1.5 h-11"
                    type="password"
                    placeholder="Re-enter password"
                    value={form.confirmPassword}
                    onChange={(e) => update("confirmPassword", e.target.value)}
                  />
                  {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
                </div>

                <Button type="submit" className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold mt-2">
                  Continue <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Company / Organization Name</Label>
                  <Input
                    className="mt-1.5 h-11"
                    placeholder="Acme Private Limited"
                    value={form.companyName}
                    onChange={(e) => update("companyName", e.target.value)}
                  />
                  {errors.companyName && <p className="text-red-500 text-xs mt-1">{errors.companyName}</p>}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Organization Subdomain
                  </Label>
                  <div className="flex mt-1.5">
                    <Input
                      className="h-11 rounded-r-none flex-1 font-mono text-sm"
                      placeholder="acme"
                      value={form.subdomain}
                      onChange={(e) =>
                        update("subdomain", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                      }
                    />
                    <div className="h-11 px-3 flex items-center bg-gray-100 dark:bg-gray-800 border border-l-0 border-gray-200 dark:border-gray-700 text-xs text-gray-400 rounded-r-none whitespace-nowrap">
                      .aupulens.online
                    </div>
                  </div>
                  {errors.subdomain && <p className="text-red-500 text-xs mt-1">{errors.subdomain}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    Your team will access ERP at{" "}
                    <span className="font-semibold text-blue-600">
                      {form.subdomain || "yourcompany"}.aupulens.online
                    </span>
                  </p>
                </div>

                {/* Plan selection placeholder */}
                <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-950/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Starter Plan · Free</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Up to 3 users · 14-day full trial · No card needed</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold mt-2"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating account…</>
                  ) : (
                    <>Create Account <ArrowRight className="h-4 w-4 ml-2" /></>
                  )}
                </Button>

                <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(1)}>
                  ← Back
                </Button>
              </div>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{" "}
            <Link href="/onboarding/signin" className="text-blue-700 dark:text-blue-400 font-semibold hover:underline">
              Sign in
            </Link>
          </p>

          <p className="mt-4 text-center text-[11px] text-gray-400">
            By creating an account, you agree to our{" "}
            <a href="#" className="underline">Terms of Service</a> and{" "}
            <a href="#" className="underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
