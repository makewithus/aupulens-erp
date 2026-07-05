"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { OnboardingHeader } from "@/components/onboarding/OnboardingHeader";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { AccountStep } from "@/components/onboarding/steps/AccountStep";
import { OrganizationStep } from "@/components/onboarding/steps/OrganizationStep";
import { BusinessStep } from "@/components/onboarding/steps/BusinessStep";

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
    if (validateStep3()) handleSubmit();
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
      
      if (typeof window !== "undefined") {
        sessionStorage.setItem("session_active", "true");

        const hostname = window.location.hostname;
        const port = window.location.port;
        const protocol = window.location.protocol;
        const cleanHost = hostname.replace(/^www\./, "");
        const isVercelDefaultDomain = hostname.endsWith(".vercel.app");

        const queryParams = `?autologin=${data.tempToken}&email=${encodeURIComponent(form.email)}&session_active=true`;
        let redirectUrl = "";

        if (isVercelDefaultDomain) {
          redirectUrl = `${protocol}//${hostname}/autologin${queryParams}`;
        } else if (hostname === "localhost" || hostname === "127.0.0.1") {
          const targetHost = `${form.subdomain}.localhost${port ? `:${port}` : ""}`;
          redirectUrl = `${protocol}//${targetHost}/autologin${queryParams}`;
        } else {
          const targetHost = `${form.subdomain}.${cleanHost}${port ? `:${port}` : ""}`;
          redirectUrl = `${protocol}//${targetHost}/autologin${queryParams}`;
        }

        window.location.href = redirectUrl;
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const update = (field: string, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <OnboardingLayout>
      <div className="space-y-6">
        <OnboardingHeader />
        <OnboardingProgress currentStep={step} />

        {step === 1 && (
          <AccountStep
            form={form}
            errors={errors}
            update={update}
            onNext={handleNextStep1}
          />
        )}

        {step === 2 && (
          <OrganizationStep
            form={form}
            errors={errors}
            update={update}
            onNext={handleNextStep2}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <BusinessStep
            form={form}
            errors={errors}
            update={update}
            onNext={handleNextStep3}
            onBack={() => setStep(2)}
            isLoading={isLoading}
          />
        )}
      </div>
    </OnboardingLayout>
  );
}
