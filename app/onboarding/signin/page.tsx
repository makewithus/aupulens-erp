"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import {
  Eye, EyeOff, Loader2, Zap, BarChart3, Users, Package,
  Building2, ArrowRight, ShieldCheck, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TESTIMONIALS = [
  {
    quote: "Aupulens transformed our accounting — we closed books 3x faster.",
    author: "Priya Nair",
    role: "CFO, TechNova Pvt Ltd",
    initials: "PN",
    color: "from-violet-500 to-indigo-600",
  },
  {
    quote: "Finally, an ERP that our team actually enjoys using every day.",
    author: "Rajan Mehta",
    role: "MD, Horizon Logistics",
    initials: "RM",
    color: "from-blue-500 to-cyan-600",
  },
  {
    quote: "The GST compliance and payroll features saved us 20+ hours a month.",
    author: "Sneha Kapoor",
    role: "HR Head, Vertex Manufacturing",
    initials: "SK",
    color: "from-emerald-500 to-teal-600",
  },
];

const MODULES = [
  { icon: BarChart3, name: "Finance" },
  { icon: Users, name: "HR & Payroll" },
  { icon: Package, name: "Inventory" },
  { icon: Building2, name: "CRM" },
];

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mouseGlowRef = useRef<HTMLDivElement>(null);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  const [form, setForm] = useState({ email: "", password: "", subdomain: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Cycle testimonials
  useEffect(() => {
    const t = setInterval(() => setCurrentTestimonial((c) => (c + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(t);
  }, []);

  // Mouse glow
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (mouseGlowRef.current) {
        mouseGlowRef.current.style.background = `radial-gradient(600px circle at ${e.clientX}px ${e.clientY}px, rgba(59,130,246,0.08), transparent 70%)`;
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Handle error from URL
  useEffect(() => {
    const errParam = searchParams.get("error");
    if (errParam) {
      setError("Invalid email, password, or organization domain.");
      toast.error("Sign in failed. Please check your credentials.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError("Email and password are required.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        tenantId: form.subdomain || "default-tenant",
        portal: "/auth",
        redirect: false,
      });
      if (result?.ok) {
        toast.success("Welcome back!");
        if (typeof window !== "undefined") {
          sessionStorage.setItem("session_active", "true");

          const sub = form.subdomain ? form.subdomain.trim().toLowerCase() : "";
          if (sub && sub !== "default-tenant" && sub !== "default") {
            const hostname = window.location.hostname;
            const port = window.location.port;
            const protocol = window.location.protocol;
            const cleanHost = hostname.replace(/^www\./, "");
            const isVercelDefaultDomain = hostname.endsWith(".vercel.app");

            if (isVercelDefaultDomain) {
              window.location.href = `${protocol}//${hostname}/admin/dashboard?session_active=true`;
              return;
            } else if (hostname === "localhost" || hostname === "127.0.0.1") {
              const targetHost = `${sub}.localhost${port ? `:${port}` : ""}`;
              window.location.href = `${protocol}//${targetHost}/admin/dashboard?session_active=true`;
              return;
            } else {
              const targetHost = `${sub}.${cleanHost}${port ? `:${port}` : ""}`;
              window.location.href = `${protocol}//${targetHost}/admin/dashboard?session_active=true`;
              return;
            }
          }

          // No subdomain — hard redirect so the session cookie is fully
          // committed before the middleware runs. router.push("/") races
          // the cookie and middleware sends the user to /onboarding/signup.
          window.location.href = "/admin/dashboard";
          return;
        }
        // SSR fallback (should not reach here in practice)
        router.push("/admin/dashboard");
        router.refresh();
      } else {
        setError("Invalid email, password, or organization domain.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const update = (f: string, v: string) => setForm((prev) => ({ ...prev, [f]: v }));
  const testimonial = TESTIMONIALS[currentTestimonial];

  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-950">
      {/* Mouse glow layer */}
      <div ref={mouseGlowRef} className="fixed inset-0 pointer-events-none z-0 transition-all duration-300" />

      {/* ── Left: Form ── */}
      <div className="flex-1 flex flex-col justify-center relative z-10 px-6 py-12 lg:px-16 xl:px-24">
        {/* Logo */}
        <div className="mb-10 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center shadow-md">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">Aupulens</span>
        </div>

        <div className="max-w-[400px] w-full">
          {/* Title */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Sign in to your account</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Access your ERP dashboard across all modules.
            </p>
          </div>

          {/* Module chips */}
          <div className="flex gap-2 flex-wrap mb-7">
            {MODULES.map(({ icon: Icon, name }) => (
              <div key={name} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
                <Icon className="h-3 w-3" />
                {name}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Work Email</Label>
              <Input
                id="signin-email"
                className="mt-1.5 h-11"
                type="email"
                placeholder="rahul@company.com"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Password</Label>
                <a href="#" className="text-xs text-blue-700 dark:text-blue-400 hover:underline">Forgot password?</a>
              </div>
              <div className="relative mt-1.5">
                <Input
                  id="signin-password"
                  className="h-11 pr-10"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Organization subdomain — optional */}
            <div>
              <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Organization Domain <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <div className="flex mt-1.5">
                <Input
                  id="signin-subdomain"
                  className="h-11 rounded-r-none flex-1 font-mono text-sm"
                  placeholder="yourcompany"
                  value={form.subdomain}
                  onChange={(e) => update("subdomain", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  disabled={isLoading}
                />
                <div className="h-11 px-3 flex items-center bg-gray-100 dark:bg-gray-800 border border-l-0 border-gray-200 dark:border-gray-700 text-xs text-gray-400 rounded-r-none whitespace-nowrap">
                  .aupulens.online
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">Leave blank to sign in as admin / default tenant.</p>
            </div>

            <Button
              id="signin-submit"
              type="submit"
              className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold mt-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing in…</>
              ) : (
                <>Sign In <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 space-y-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
              Secured with 256-bit encryption
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
              SOC 2 compliant infrastructure
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            New to Aupulens?{" "}
            <Link href="/onboarding/signup" className="text-blue-700 dark:text-blue-400 font-semibold hover:underline">
              Start free trial
            </Link>
          </p>

          {/* Portal quick links */}
          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400 text-center mb-3">Or sign in to a specific portal</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Finance", href: "/auth/finance" },
                { label: "Admin", href: "/auth/admin" },
                { label: "HR", href: "/auth/hr" },
              ].map((p) => (
                <Link
                  key={p.label}
                  href={p.href}
                  className="text-center py-2 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  {p.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Showcase ── */}
      <div className="hidden lg:flex lg:w-[48%] flex-col bg-gradient-to-br from-[#1a237e] via-[#1565c0] to-[#0277bd] relative overflow-hidden">
        {/* Decorative */}
        <div className="absolute top-[-100px] right-[-100px] w-[320px] h-[320px] rounded-full bg-white/5" />
        <div className="absolute bottom-[-60px] left-[-60px] w-[220px] h-[220px] rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col justify-between h-full px-14 py-14">
          <div>
            <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-6">Why companies love Aupulens</p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-10">
              {[
                { stat: "1st", label: "Fully Automated ERP" },
                { stat: "99.9%", label: "Uptime" },
                { stat: "4.8★", label: "Rating" },
              ].map(({ stat, label }) => (
                <div key={label} className="text-center p-4 rounded-xl bg-white/10">
                  <p className="text-2xl font-extrabold text-white">{stat}</p>
                  <p className="text-xs text-blue-200 mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Dashboard preview mockup */}
            <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur p-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                <div className="flex-1 h-5 rounded bg-white/10 ml-2" />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {["Revenue", "Invoices", "Employees"].map((label) => (
                  <div key={label} className="bg-white/10 rounded-lg p-3">
                    <div className="h-2 w-12 bg-white/40 rounded mb-2" />
                    <div className="h-5 w-16 bg-white/60 rounded" />
                    <p className="text-[10px] text-blue-200 mt-1">{label}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[80, 60, 90, 45].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-white/20" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          </div>

          {/* Testimonial carousel */}
          <div className="mt-8">
            <div className="p-5 rounded-2xl bg-white/10 backdrop-blur border border-white/20 transition-all duration-500">
              <p className="text-white text-sm leading-relaxed italic">&ldquo;{testimonial.quote}&rdquo;</p>
              <div className="flex items-center gap-3 mt-4">
                <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${testimonial.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                  {testimonial.initials}
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{testimonial.author}</p>
                  <p className="text-blue-200 text-xs">{testimonial.role}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-1.5 justify-center mt-3">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentTestimonial(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === currentTestimonial ? "w-6 bg-white" : "w-1.5 bg-white/30"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
