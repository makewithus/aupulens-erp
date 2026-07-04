"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Eye, EyeOff } from "lucide-react";

// TODO: confirm the final GSP provider name with the business/legal team.
const GSP_PROVIDER = "Aupulens GSP";

interface EInvoiceConnectWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Add GSP Details" },
    { n: 2, label: "EInvoice GSP Login" },
    { n: 3, label: "Done" },
  ];
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step > s.n
                  ? "bg-blue-600 text-white"
                  : step === s.n
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              {step > s.n ? <Check className="w-4 h-4" /> : s.n}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className="w-10 h-px bg-gray-300 dark:bg-gray-700 mb-5" />}
        </div>
      ))}
    </div>
  );
}

export function EInvoiceConnectWizard({ open, onOpenChange, onConnected }: EInvoiceConnectWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep(1);
    setUsername("");
    setPassword("");
    setShowPassword(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  const handleSubmitCredentials = async () => {
    if (!username.trim() || !password) {
      toast.error("GSP Username and Password are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/sales/e-invoices/gsp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: GSP_PROVIDER, username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to connect to the E-Invoicing portal");
      }
      setStep(3);
      onConnected();
    } catch (e: any) {
      toast.error(e.message || "Failed to connect to the E-Invoicing portal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : handleClose())}>
      <DialogContent className="max-w-2xl">
        <div className="pt-2">
          <h2 className="text-lg font-semibold mb-1">Connecting to EInvoice Portal</h2>
          <p className="text-xs text-muted-foreground mb-4">E-Invoice GSP Login</p>

          <StepIndicator step={step} />

          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground max-w-xs">
                  Two simple steps to get you started with E-Invoicing quickly.
                </p>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setStep(2)}>
                  Proceed to EInvoice GSP Login →
                </Button>
              </div>

              <div>
                <p className="font-semibold text-sm">STEP-1</p>
                <div className="border-b my-2" />
                <ol className="list-decimal list-inside text-sm space-y-2 text-muted-foreground">
                  <li>
                    Login to EInvoice Portal{" "}
                    <a
                      href="https://einvoice1.gst.gov.in/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      https://einvoice1.gst.gov.in/
                    </a>
                  </li>
                  <li>On the left Menu click on API Registration &gt; User Credentials &gt; Create API User</li>
                  <li>
                    Click Send OTP. (Please note that you will receive OTP to the registered mobile number on your
                    Einvoice Portal.)
                  </li>
                  <li>Verify OTP</li>
                </ol>
              </div>

              <div>
                <p className="font-semibold text-sm">STEP-2 (After Verification of OTP)</p>
                <div className="border-b my-2" />
                <ol className="list-decimal list-inside text-sm space-y-2 text-muted-foreground">
                  <li>Click the Add/New Button</li>
                  <li>
                    Select <span className="font-medium">{GSP_PROVIDER}</span> in the GSP Name dropdown and click on
                    Submit.
                  </li>
                  <li>Create your 3 letter Suffix ID and a password</li>
                  <li>
                    Remember to keep a screenshot of both the username and password as it could come in handy down
                    the line.
                  </li>
                  <li>Login with these credentials on this page in the next step.</li>
                </ol>
              </div>

              <div className="flex justify-start pt-2">
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={handleClose}
                >
                  Close
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-sm px-4 py-2 rounded-none">
                Enter GSP Username and Password from the EInvoice Portal
              </div>

              <div className="space-y-1.5">
                <Label>
                  Provider <span className="text-red-500">*</span>
                </Label>
                <Select value={GSP_PROVIDER} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GSP_PROVIDER}>{GSP_PROVIDER}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>
                  GSP Username <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="eg. API_XXXXXXXXXX"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>
                  GSP Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← Go Back
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleSubmitCredentials}
                  disabled={submitting}
                >
                  {submitting ? "Connecting..." : "Proceed to Generate EInvoice →"}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center text-center py-8 space-y-4">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">You're connected to the E-Invoicing portal!</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                You can now generate e-invoices directly from your Sales invoices.
              </p>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
