"use client";

import * as React from "react";
import {
  FileText,
  Calendar,
  User,
  CreditCard,
  Building,
  DollarSign,
  Briefcase,
  AlertCircle,
  Hash,
  Wallet,
  Receipt,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import { Chatter } from "@/components/dashboard/Chatter";
import { toast } from "sonner";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

interface ExpensePopupContentProps {
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly?: boolean;
}

export function ExpensePopupContent({
  formData,
  setFormData,
  isViewOnly = false,
}: ExpensePopupContentProps) {
  const [activeTab, setActiveTab] = React.useState("general");
  const [accounts, setAccounts] = React.useState<any[]>([]);
  const [employees, setEmployees] = React.useState<any[]>([]);

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/accounting/accounts");
      const data = await res.json();
      setAccounts(data.items || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  }

  async function fetchEmployees() {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setEmployees(data.users || data.items || []);
    } catch (error) {
      console.error("Error fetching employees:", error);
    }
  }

  async function handleCreateAccount(newAcc: any) {
    try {
      const res = await fetch("/api/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAcc),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Account created successfully");
        fetchAccounts();
        return data.account;
      } else {
        toast.error(data.error || "Failed to create account");
        return null;
      }
    } catch (error) {
      toast.error("Error creating account");
      return null;
    }
  }

  React.useEffect(() => {
    fetchAccounts();
    fetchEmployees();
  }, []);

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSendMessage = (body: string) => {
    const newMessage = {
      authorId: null, // Backend sets this
      body,
      type: "comment",
      createdAt: new Date(),
    };
    const updatedChatter = [...(formData.chatter || []), newMessage];
    updateField("chatter", updatedChatter);
  };

  const tabs = [
    { id: "general", label: "General Information", icon: FileText },
    { id: "accounting", label: "Accounting & Team", icon: Building },
    { id: "notes", label: "Description & Notes", icon: FileText },
    { id: "chatter", label: "Chatter", icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      {/* Header Section (Product-style) */}
      <div className="flex items-start gap-6 border-b pb-6">
        <div className="w-24 h-24 bg-primary/10 flex items-center justify-center none-2xl relative group shrink-0">
          <Receipt className="w-12 h-12 text-primary" />
          <div className="absolute -top-2 -right-2">
            <Badge
              variant={formData.status === DOCUMENT_STATUS.POSTED ? "default" : "secondary"}
              className="none-full px-3 uppercase text-[9px] font-black"
            >
              {formData.status || DOCUMENT_STATUS.DRAFT}
            </Badge>
          </div>
        </div>
        <div className="flex-1 space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="description"
              className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60"
            >
              Expense Description *
            </Label>
            <Input
              id="description"
              value={formData.description || ""}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="e.g. Flight to Mumbai"
              className="text-xl font-bold h-12 none-xl border-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="isTaxIncluded"
                checked={formData.isTaxIncluded}
                onCheckedChange={(v) => updateField("isTaxIncluded", !!v)}
              />
              <Label
                htmlFor="isTaxIncluded"
                className="text-xs font-bold text-muted-foreground uppercase tracking-wider"
              >
                Include Taxes
              </Label>
            </div>
            <div className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">
              REF: EXP/{formData._id?.slice(-4) || "NEW"}
            </div>
          </div>
        </div>
      </div>

      {/* Content Layout */}
      <div className="grid grid-cols-12 gap-8">
        {/* Main Form Area */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="space-y-6">
            <div className="flex border-b overflow-x-auto whitespace-nowrap scrollbar-hide gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors border-b-2 flex items-center gap-2 ${
                    activeTab === tab.id
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <tab.icon className="h-3 w-3" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="min-h-[400px]">
              {activeTab === "general" && (
                <div className="grid grid-cols-2 gap-x-8 gap-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Category
                    </Label>
                    <Select
                      value={formData.category || "others"}
                      onValueChange={(v) => updateField("category", v)}
                    >
                      <SelectTrigger className="none-xl border-2 h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="communication">
                          Communication
                        </SelectItem>
                        <SelectItem value="others">Others</SelectItem>
                        <SelectItem value="meals">Meals</SelectItem>
                        <SelectItem value="travel">Travel</SelectItem>
                        <SelectItem value="supplies">Supplies</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Total Amount (₹)
                    </Label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                        ₹
                      </div>
                      <Input
                        type="number"
                        value={formData.total || 0}
                        onChange={(e) =>
                          updateField("total", parseFloat(e.target.value))
                        }
                        className="pl-8 text-lg font-black h-12 none-xl border-2"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Expense Date
                    </Label>
                    <Input
                      type="date"
                      value={
                        formData.expenseDate
                          ? new Date(formData.expenseDate)
                              .toISOString()
                              .split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        updateField("expenseDate", e.target.value)
                      }
                      className="none-xl border-2 h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Paid By
                    </Label>
                    <Select
                      value={formData.paidBy || "employee"}
                      onValueChange={(v) => updateField("paidBy", v)}
                    >
                      <SelectTrigger className="none-xl border-2 h-12 uppercase font-black text-xs tracking-widest">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">
                          Employee (Reimburse)
                        </SelectItem>
                        <SelectItem value="company">
                          Company (Direct)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.isTaxIncluded && (
                    <div className="col-span-2 p-6 bg-muted/30 none-2xl border-2 border-dashed border-muted flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                          Tax Component
                        </Label>
                        <p className="text-[10px] text-muted-foreground opacity-60">
                          Specify the amount of tax included in total
                        </p>
                      </div>
                      <div className="w-48">
                        <Input
                          type="number"
                          value={formData.taxAmount || 0}
                          onChange={(e) =>
                            updateField("taxAmount", parseFloat(e.target.value))
                          }
                          className="text-right font-black none-xl border-2 h-11"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "accounting" && (
                <div className="grid grid-cols-2 gap-x-8 gap-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="col-span-2 space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Expense Account
                    </Label>
                    <SelectSearchAdd
                      items={accounts}
                      value={formData.accountId}
                      onValueChange={(v) => updateField("accountId", v)}
                      placeholder="Select Account"
                      keyField="_id"
                      labelField="name"
                      secondaryField="code"
                      defaultAccountType="expense"
                      onAdd={handleCreateAccount}
                      addButtonLabel="Add Expense Account"
                      className="none-xl border-2 h-12 shadow-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Staff / Employee
                    </Label>
                    <SelectSearchAdd
                      items={employees}
                      value={formData.employeeId}
                      onValueChange={(v) => updateField("employeeId", v)}
                      placeholder="Select Employee"
                      keyField="_id"
                      labelField="name"
                      className="none-xl border-2 h-12 shadow-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Manager / Reviewer
                    </Label>
                    <SelectSearchAdd
                      items={employees}
                      value={formData.managerId}
                      onValueChange={(v) => updateField("managerId", v)}
                      placeholder="Select Manager"
                      keyField="_id"
                      labelField="name"
                      className="none-xl border-2 h-12 shadow-none"
                    />
                  </div>

                  {/* Payment Account Selection */}
                  <div className="col-span-2 p-6 none-2xl border-2 border-primary/20 bg-primary/5 space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 none-lg bg-primary/10 flex items-center justify-center">
                        <CreditCard className="h-4 w-4 text-primary" />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-primary">
                          {formData.paidBy === "company"
                            ? "Bank / Cash Account"
                            : "Payable Account"}
                        </Label>
                        <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter opacity-60">
                          {formData.paidBy === "company"
                            ? "Select the bank or petty cash account used for this payment."
                            : "Select the outstanding payables account for employee reimbursement."}
                        </p>
                      </div>
                    </div>
                    <SelectSearchAdd
                      items={accounts.filter((acc) =>
                        formData.paidBy === "company"
                          ? acc.internal_group === "asset" ||
                            acc.account_type === "asset_cash"
                          : acc.internal_group === "liability" ||
                            acc.account_type === "liability_payable",
                      )}
                      value={formData.paymentAccountId}
                      onValueChange={(v) => updateField("paymentAccountId", v)}
                      placeholder={
                        formData.paidBy === "company"
                          ? "Select Cash/Bank Account"
                          : "Select Payable Account"
                      }
                      keyField="_id"
                      labelField="name"
                      secondaryField="code"
                      onAdd={handleCreateAccount}
                      defaultAccountType={
                        formData.paidBy === "company"
                          ? "asset_cash"
                          : "liability_payable"
                      }
                      addButtonLabel={
                        formData.paidBy === "company"
                          ? "Create Bank Account"
                          : "Create Payable Account"
                      }
                      className="none-xl border-2 h-11 shadow-none bg-background text-foreground"
                    />
                    {!formData.paymentAccountId && (
                      <p className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1.5 px-1 animate-pulse">
                        <AlertCircle className="h-3 w-3" /> Required for posting
                        to Journal
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Internal Justification & Notes
                    </Label>
                    <Textarea
                      value={formData.notes || ""}
                      onChange={(e) => updateField("notes", e.target.value)}
                      placeholder="Reason for expense or any additional details..."
                      className="min-h-[200px] none-2xl border-2 bg-muted/5 p-6 font-medium"
                    />
                  </div>
                </div>
              )}

              {activeTab === "chatter" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <Chatter
                    messages={formData.chatter || []}
                    onSendMessage={handleSendMessage}
                    isViewOnly={isViewOnly}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary Sidebar */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="p-8 none-3xl border-2 bg-muted/5 space-y-8 sticky top-6">
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                Expense Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b-2 border-dashed">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                    <Hash className="h-3 w-3 opacity-40" /> Category
                  </span>
                  <Badge
                    variant="outline"
                    className="none-full font-black uppercase text-[10px] tracking-widest border-2"
                  >
                    {formData.category || "---"}
                  </Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b-2 border-dashed">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                    <Calendar className="h-3 w-3 opacity-40" /> Date
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-widest">
                    {formData.expenseDate
                      ? new Date(formData.expenseDate).toLocaleDateString()
                      : "---"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                    <User className="h-3 w-3 opacity-40" /> Reviewer
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-widest text-primary/80">
                    {employees.find((e) => e._id === formData.managerId)
                      ?.name || "Not Assigned"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-6 bg-primary/5 none-2xl border-2 border-primary/10">
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/40 text-center">
                  Payment Details
                </p>
                <div className="space-y-4 pt-4">
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                    <span className="opacity-40">Subtotal</span>
                    <span>
                      ₹{" "}
                      {(
                        formData.total - (formData.taxAmount || 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                    <span className="opacity-40">
                      Taxes ({formData.isTaxIncluded ? "Inc" : "Exc"})
                    </span>
                    <span>₹ {(formData.taxAmount || 0).toLocaleString()}</span>
                  </div>
                  <div className="pt-4 border-t-2 border-primary/10">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">
                        Total
                      </span>
                      <span className="text-3xl font-black font-sans tabular-nums text-primary tracking-tighter">
                        ₹ {formData.total?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 none-2xl bg-muted/10 border-2 border-dashed flex items-center gap-4 group">
              <div className="h-10 w-10 none-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <CreditCard className="h-5 w-5 opacity-40 group-hover:text-primary group-hover:opacity-100 transition-all" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                  Payment Method
                </p>
                <p className="text-[11px] font-black uppercase tracking-widest mt-0.5">
                  {formData.paidBy === "employee"
                    ? "Employee Reimbursement"
                    : "Direct Company Pay"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
