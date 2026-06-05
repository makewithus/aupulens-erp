"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Eye, EyeOff, CheckCircle2, ArrowRight, Loader2,
  Building2, BarChart3, Users, Package, ShieldCheck, Zap,
  Globe, Landmark, Check
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "next-auth/react";
import { useAuthStore } from "@/store/authStore";

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

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { checkSession } = useAuthStore();

  // Unified state form
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    companyName: "",
    subdomain: "",
    password: "",
    confirmPassword: "",
    country: "India",
    state: "",
    industry: "",
    isGstRegistered: false,
    agreeTerms: false,
    modules: {
      manufacturing: false,
      retailStore: false,
      distribution: false,
      payroll: false,
      travelExpense: false
    }
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

  const validateStep3 = () => {
    const errs: Record<string, string> = {};
    if (!form.companyName.trim()) errs.companyName = "Organization Name is required";
    if (!form.country.trim()) errs.country = "Country is required";
    if (!form.state.trim()) errs.state = "State/Union Territory is required";
    if (!form.industry.trim()) errs.industry = "Industry Type is required";
    if (!form.agreeTerms) errs.agreeTerms = "You must agree to the Terms of Service and Privacy Policy";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep1 = () => {
    if (validateStep1()) setStep(2);
  };

  const handleNextStep2 = () => {
    if (validateStep2()) setStep(3);
  };

  const handleNextStep3 = () => {
    if (validateStep3()) setStep(4);
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const selectedModules = Object.entries(form.modules)
        .filter(([_, enabled]) => enabled)
        .map(([key]) => key);

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
          country: form.country,
          state: form.state,
          industry: form.industry,
          isGstRegistered: form.isGstRegistered,
          enabledModules: selectedModules,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      toast.success("Account created successfully!");
      
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        tenantId: form.subdomain,
        portal: "/auth/admin",
        redirect: false,
      });

      if (result?.ok) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("session_active", "true");
          
          await checkSession(true);

          const hostname = window.location.hostname;
          const port = window.location.port;
          const protocol = window.location.protocol;
          const cleanHost = hostname.replace(/^www\./, "");
          const isVercelDefaultDomain = hostname.endsWith(".vercel.app");

          if (isVercelDefaultDomain) {
            window.location.href = `${protocol}//${hostname}/admin/dashboard?session_active=true`;
          } else if (hostname === "localhost" || hostname === "127.0.0.1") {
            const targetHost = `${form.subdomain}.localhost${port ? `:${port}` : ""}`;
            window.location.href = `${protocol}//${targetHost}/admin/dashboard?session_active=true`;
          } else {
            const targetHost = `${form.subdomain}.${cleanHost}${port ? `:${port}` : ""}`;
            window.location.href = `${protocol}//${targetHost}/admin/dashboard?session_active=true`;
          }
        }
      } else {
        router.push("/auth/admin");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const update = (field: string, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggleModule = (moduleKey: keyof typeof form.modules) => {
    setForm((prev) => ({
      ...prev,
      modules: {
        ...prev.modules,
        [moduleKey]: !prev.modules[moduleKey]
      }
    }));
  };

  // Get user's first name for greeting
  const firstName = form.name.split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col justify-between">
      {/* Dynamic layouts depending on onboarding steps */}
      {step < 4 ? (
        <div className="min-h-screen flex">
          {/* Left panel (Showcase) for Steps 1, 2, 3 */}
          <div className="hidden lg:flex lg:w-[50%] flex-col bg-gradient-to-br from-[#1a237e] via-[#283593] to-[#1565c0] relative overflow-hidden">
            <div className="absolute top-[-120px] right-[-120px] w-[380px] h-[380px] rounded-full bg-white/5" />
            <div className="absolute bottom-[-80px] left-[-80px] w-[260px] h-[260px] rounded-full bg-white/5" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-white/3" />

            <div className="relative z-10 flex flex-col justify-between h-full px-16 py-14">
              <div className="flex items-center">
                <Image
                  src="/logo-white(1).png"
                  alt="Aupulens"
                  width={140}
                  height={40}
                  priority
                  className="h-10 w-auto object-contain"
                />
              </div>

              <div className="space-y-10">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-xs font-medium">
                    <ShieldCheck className="h-3.5 w-3.5" /> {"World's first fully automated ERP"}
                  </div>
                  <h1 className="text-4xl font-bold text-white leading-tight">
                    One platform for your entire business
                  </h1>
                  <p className="text-blue-100 text-base leading-relaxed max-w-md">
                    Finance, HR, Inventory, CRM — all connected. Built for modern SMEs, startups, and enterprises.
                  </p>
                </div>

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

          {/* Right panel (Forms for step 1, 2, 3) */}
          <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-16 xl:px-24">
            <div className="lg:hidden mb-10 flex items-center">
              <Image
                src="/logo-dark.png"
                alt="Aupulens"
                width={120}
                height={34}
                priority
                className="h-8 w-auto object-contain dark:hidden"
              />
              <Image
                src="/logo-white(1).png"
                alt="Aupulens"
                width={120}
                height={34}
                priority
                className="h-8 w-auto object-contain hidden dark:block"
              />
            </div>

            <div className="max-w-[440px] w-full mx-auto">
              {/* HEADER INFO */}
              {step !== 3 && (
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {step === 1 ? "Create your account" : "Set up your organization"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {step === 1
                      ? "Start your free 14-day trial. No credit card required."
                      : "You're almost there! Tell us about your company."}
                  </p>

                  <div className="flex items-center gap-2 mt-4">
                    {[1, 2, 3].map((s) => (
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
                        {s < 3 && <div className={`h-px w-10 ${step > s ? "bg-blue-700" : "bg-gray-200 dark:bg-gray-700"}`} />}
                      </div>
                    ))}
                    <span className="ml-1 text-xs text-gray-400">Step {step} of 3</span>
                  </div>
                </div>
              )}

              {/* STEP 1: PERSONAL DETAILS */}
              {step === 1 && (
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

                  <Button type="button" onClick={handleNextStep1} className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold mt-2">
                    Continue <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>

                  <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    Already have an account?{" "}
                    <Link href="/onboarding/signin" className="text-blue-700 dark:text-blue-400 font-semibold hover:underline">
                      Sign in
                    </Link>
                  </p>
                </div>
              )}

              {/* STEP 2: COMPANY & SUBDOMAIN */}
              {step === 2 && (
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
                    type="button"
                    onClick={handleNextStep2}
                    className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold mt-2"
                  >
                    Continue <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>

                  <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(1)}>
                    ← Back
                  </Button>
                </div>
              )}

              {/* STEP 3: TELL US MORE ABOUT YOUR BUSINESS (SCREEN 1) */}
              {step === 3 && (
                <div className="w-full max-w-[520px] mx-auto py-4">
                  <div className="text-center mb-8">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Welcome aboard, {firstName}!</p>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mt-1">Tell us more about your business</h2>
                  </div>

                  <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-2xl p-6 md:p-8 shadow-xl space-y-6">
                    {/* Org Name */}
                    <div>
                      <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Organization Name<span className="text-red-500 ml-0.5">*</span>
                      </Label>
                      <Input
                        className="mt-1.5 h-11 border-gray-300 focus-visible:ring-blue-500 focus-visible:border-blue-500"
                        placeholder="Organization Name"
                        value={form.companyName}
                        onChange={(e) => update("companyName", e.target.value)}
                      />
                      {errors.companyName && <p className="text-red-500 text-xs mt-1">{errors.companyName}</p>}
                    </div>

                    {/* Country & State */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          Country<span className="text-red-500 ml-0.5">*</span>
                        </Label>
                        <select
                          className="w-full mt-1.5 h-11 px-3 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-950 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.country}
                          onChange={(e) => update("country", e.target.value)}
                        >
                          <option value="India">India</option>
                          <option value="United States">United States</option>
                          <option value="United Kingdom">United Kingdom</option>
                          <option value="Singapore">Singapore</option>
                          <option value="United Arab Emirates">United Arab Emirates</option>
                        </select>
                        {errors.country && <p className="text-red-500 text-xs mt-1">{errors.country}</p>}
                      </div>

                      <div>
                        <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          State/Union Territory<span className="text-red-500 ml-0.5">*</span>
                        </Label>
                        <select
                          className="w-full mt-1.5 h-11 px-3 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-950 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={form.state}
                          onChange={(e) => update("state", e.target.value)}
                        >
                          <option value="">Select State</option>
                          {STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state}</p>}
                      </div>
                    </div>

                    {/* Industry */}
                    <div>
                      <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Industry Type<span className="text-red-500 ml-0.5">*</span>
                      </Label>
                      <select
                        className="w-full mt-1.5 h-11 px-3 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-950 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.industry}
                        onChange={(e) => update("industry", e.target.value)}
                      >
                        <option value="">Select or type to add</option>
                        {INDUSTRIES.map((ind) => (
                          <option key={ind} value={ind}>{ind}</option>
                        ))}
                      </select>
                      {errors.industry && <p className="text-red-500 text-xs mt-1">{errors.industry}</p>}
                    </div>

                    {/* REGIONAL SETTINGS CARD */}
                    <div className="bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-xl p-4 space-y-3.5 text-sm text-gray-600 dark:text-gray-400">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Regional Settings*</p>
                      
                      <div className="flex items-center justify-between">
                        <span>Base Currency:</span>
                        <span className="font-semibold text-gray-900 dark:text-white">INR - Indian Rupee</span>
                      </div>

                      <div className="flex items-start justify-between">
                        <span className="flex-shrink-0">Time Zone:</span>
                        <span className="font-semibold text-gray-900 dark:text-white text-right ml-2">(GMT 5:30) India Standard Time (Asia/Calcutta)</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span>Language:</span>
                        <span className="font-semibold text-gray-900 dark:text-white">English</span>
                      </div>
                    </div>

                    {/* GST Registration Checkbox */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="mt-1 h-4.5 w-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={form.isGstRegistered}
                        onChange={(e) => update("isGstRegistered", e.target.checked)}
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-950 dark:group-hover:text-white transition-colors">
                        Is this business registered for GST?
                      </span>
                    </label>

                    {/* Terms Checkbox */}
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          className="mt-1 h-4.5 w-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={form.agreeTerms}
                          onChange={(e) => update("agreeTerms", e.target.checked)}
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                          I agree to the <a href="#" className="text-blue-600 hover:underline">Terms of Service</a> and <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>.
                        </span>
                      </label>
                      {errors.agreeTerms && <p className="text-red-500 text-xs mt-1">{errors.agreeTerms}</p>}
                    </div>

                    <Button
                      type="button"
                      onClick={handleNextStep3}
                      className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-all rounded-lg"
                    >
                      Continue
                    </Button>

                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="w-full text-center text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mt-2"
                    >
                      Back to Step 2
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* STEP 4: ENABLE MODULES SPLIT SCREEN (SCREEN 2) */
        <div className="min-h-screen flex flex-col lg:flex-row bg-[#fafbff] dark:bg-gray-950">
          
          {/* Left panel (Core modules showcase) */}
          <div className="flex-1 lg:w-[48%] flex flex-col justify-between px-10 py-12 lg:px-20 lg:py-16 bg-[#f5f7ff] dark:bg-gray-900 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-800 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>

            <div className="relative z-10 space-y-10">
              {/* App Logo */}
              <div className="flex items-center">
                <Image
                  src="/logo-dark.png"
                  alt="Aupulens"
                  width={140}
                  height={40}
                  priority
                  className="h-10 w-auto object-contain"
                />
              </div>

              {/* Title */}
              <div className="space-y-4">
                <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white leading-tight">
                  We&rsquo;ve enabled the core modules for you
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md">
                  Everything you need to run standard sales, inventory, and back-office operations is active right away.
                </p>
              </div>

              {/* ENABLED BY DEFAULT PANEL */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-150 dark:border-gray-700 p-6 shadow-md max-w-md">
                <p className="text-xs font-bold text-amber-500 flex items-center gap-1.5 uppercase tracking-widest mb-4">
                  <Zap className="h-3.5 w-3.5 fill-amber-500" /> Enabled By Default
                </p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm text-gray-600 dark:text-gray-300">
                  {[
                    "Sales", "Procurement", "Purchases", "Inventory", "Banking", 
                    "Subscription Billing", "Projects & Time Sheets", "Accounting", 
                    "Budgeting", "Reports & Analytics"
                  ].map((mod) => (
                    <div key={mod} className="flex items-center gap-2">
                      <div className="h-4.5 w-4.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center flex-shrink-0">
                        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                      </div>
                      <span className="font-medium">{mod}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-gray-400 text-xs italic font-medium">
                    & more
                  </div>
                </div>
              </div>
            </div>

            {/* Note Footnote */}
            <div className="relative z-10 mt-10 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 max-w-md">
              <span className="font-semibold text-blue-600 dark:text-blue-400">Note: </span>
              You can configure these modules any time later from <span className="font-semibold">Settings &rarr; Configure Modules</span>.
            </div>
          </div>

          {/* Right panel (Interactive modules activation checklist) */}
          <div className="flex-1 lg:w-[52%] flex flex-col justify-center px-10 py-12 lg:px-20 lg:py-16 bg-white dark:bg-gray-950">
            <div className="max-w-[500px] w-full mx-auto space-y-8">
              
              <div className="space-y-2">
                <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">Enable Your Business-Specific Modules</h2>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Customize your experience</p>
              </div>

              <div className="space-y-6">
                
                {/* OPERATIONS SECTION */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Operations</h3>
                  
                  <div className="space-y-2.5">
                    {[
                      {
                        key: "manufacturing" as const,
                        label: "Manufacturing",
                        desc: "Manage production, work orders, and operations."
                      },
                      {
                        key: "retailStore" as const,
                        label: "Retail Store",
                        desc: "Manage sales and operations for your retail store."
                      },
                      {
                        key: "distribution" as const,
                        label: "Distribution",
                        desc: "Organize sales regions, routes, and beat operations."
                      }
                    ].map(({ key, label, desc }) => (
                      <label
                        key={key}
                        className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer select-none ${
                          form.modules[key]
                            ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-500 shadow-sm"
                            : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                        }`}
                        onClick={() => toggleModule(key)}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={form.modules[key]}
                          readOnly
                        />
                        <div>
                          <p className="font-semibold text-sm text-gray-900 dark:text-white">{label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* PEOPLE OPERATIONS SECTION */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">People Operations</h3>
                  
                  <div className="space-y-2.5">
                    {[
                      {
                        key: "payroll" as const,
                        label: "Payroll",
                        desc: "Manage payroll, statutory liabilities, and IT declarations."
                      },
                      {
                        key: "travelExpense" as const,
                        label: "Travel & Expense",
                        desc: "Manage trips, expenses, and employee reimbursements."
                      }
                    ].map(({ key, label, desc }) => (
                      <label
                        key={key}
                        className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer select-none ${
                          form.modules[key]
                            ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-500 shadow-sm"
                            : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                        }`}
                        onClick={() => toggleModule(key)}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={form.modules[key]}
                          readOnly
                        />
                        <div>
                          <p className="font-semibold text-sm text-gray-900 dark:text-white">{label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-12 text-sm font-medium border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
                  onClick={() => setStep(3)}
                  disabled={isLoading}
                >
                  Back
                </Button>

                <Button
                  type="button"
                  className="flex-[2] h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md shadow-blue-600/10"
                  onClick={handleSubmit}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Seeding & Launching…</>
                  ) : (
                    <>Get Started <ArrowRight className="h-4 w-4 ml-2" /></>
                  )}
                </Button>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  );
}
