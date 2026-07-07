"use client";

import * as React from "react";
import {
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  FileText,
  User,
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
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import { toast } from "sonner";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { CustomerPopupContent } from "@/app/sales/customers/popup/CustomerPopup";
import { Loader2, CheckCircle2, History } from "lucide-react";
import { DOCUMENT_STATUS, DocumentStatus } from "@/lib/constants/statuses";

interface JournalEntryPopupContentProps {
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly?: boolean;
}

export function JournalEntryPopupContent({
  formData,
  setFormData,
  isViewOnly = false,
}: JournalEntryPopupContentProps) {
  const [accounts, setAccounts] = React.useState<any[]>([]);
  const [accountsLoading, setAccountsLoading] = React.useState(true);
  const [partners, setPartners] = React.useState<any[]>([]);

  // The Account model has two co-existing field styles (old `name`/`code`
  // vs. the newer Chart-of-Accounts-feature `accountName`/`accountCode`) —
  // normalize to one shape so every account gets a real, non-blank label in
  // the picker regardless of which style created it.
  const accountOptions = React.useMemo(
    () =>
      accounts.map((a: any) => ({
        _id: a._id,
        name: a.name || a.accountName || "(unnamed account)",
        code: a.code || a.accountCode || "",
      })),
    [accounts],
  );

  // Partner Create State
  const [isPartnerModalOpen, setIsPartnerModalOpen] = React.useState(false);
  const [activePartnerTab, setActivePartnerTab] = React.useState("address");
  const [isSubmittingPartner, setIsSubmittingPartner] = React.useState(false);
  const [partnerFormData, setPartnerFormData] = React.useState({
    header: { name: "", is_company: true, parent_id: "" },
    contact_details: { email: "", phone: "", mobile: "", website: "" },
    address_tab: {
      type: "contact",
      street: "",
      street2: "",
      city: "",
      zip: "",
    },
    sales_purchase_tab: { user_id: "default" },
    accounting_tab: {
      property_account_receivable_id: "",
      property_account_payable_id: "",
    },
  });

  React.useEffect(() => {
    fetchAccounts();
    fetchPartners();
  }, []);

  const fetchAccounts = async () => {
    setAccountsLoading(true);
    try {
      const res = await fetch("/api/accounting/accounts");
      const data = await res.json();
      setAccounts(data.items || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setAccountsLoading(false);
    }
  };

  const fetchPartners = async () => {
    try {
      const res = await fetch("/api/sales/customers");
      const data = await res.json();
      setPartners(data.items || []);
    } catch (error) {
      console.error("Error fetching partners:", error);
    }
  };

  const handleSavePartner = async (status: DocumentStatus) => {
    if (!partnerFormData.header.name) {
      toast.error("Partner name is required");
      return;
    }
    setIsSubmittingPartner(true);
    try {
      const res = await fetch("/api/sales/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...partnerFormData, status }),
      });
      if (!res.ok) throw new Error("Failed to create partner");
      const created = await res.json();
      toast.success("Partner created successfully");
      await fetchPartners();
      setIsPartnerModalOpen(false);
      return created;
    } catch (error: any) {
      toast.error(error.message || "Failed to create partner");
      return null;
    } finally {
      setIsSubmittingPartner(false);
    }
  };

  const addLine = () => {
    const lines = [...(formData.lineIds || [])];
    lines.push({
      accountId: "",
      partnerId: "",
      label: "",
      debit: 0,
      credit: 0,
    });
    setFormData({ ...formData, lineIds: lines });
  };

  const removeLine = (index: number) => {
    const lines = [...formData.lineIds];
    lines.splice(index, 1);
    setFormData({ ...formData, lineIds: lines });
    calculateTotals(lines);
  };

  const updateLine = (index: number, field: string, value: any) => {
    const lines = [...formData.lineIds];
    lines[index] = { ...lines[index], [field]: value };
    setFormData({ ...formData, lineIds: lines });
    if (field === "debit" || field === "credit") {
      calculateTotals(lines);
    }
  };

  const calculateTotals = (lines: any[]) => {
    const totalDebit = lines.reduce(
      (sum, line) => sum + (Number(line.debit) || 0),
      0,
    );
    const totalCredit = lines.reduce(
      (sum, line) => sum + (Number(line.credit) || 0),
      0,
    );

    setFormData((prev: any) => ({
      ...prev,
      totals: {
        ...prev.totals,
        amountUntaxed: totalDebit, // Usually debit side or something
        amountTotal: totalDebit,
      },
      // We also store these for UI validation if needed
      totalDebit,
      totalCredit,
    }));
  };

  const onAddAccount = async (newAcc: any) => {
    try {
      const res = await fetch("/api/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAcc),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create account");
      }
      const data = await res.json();
      const created = data.account;
      await fetchAccounts();
      return created;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    }
  };

  return (
    <div className="space-y-8 py-4 max-h-[70vh] overflow-y-auto px-1">
      {/* Header Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <FileText className="h-3 w-3" /> Entry Name
          </Label>
          <Input
            value={formData.header?.name || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                header: { ...formData.header, name: e.target.value },
              })
            }
            placeholder="e.g. MISC/2026/001"
            disabled={isViewOnly}
            className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 px-0 h-9 font-medium"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <CalendarIcon className="h-3 w-3" /> Date
          </Label>
          <Input
            type="date"
            value={
              formData.header?.date
                ? new Date(formData.header.date).toISOString().split("T")[0]
                : ""
            }
            onChange={(e) =>
              setFormData({
                ...formData,
                header: { ...formData.header, date: e.target.value },
              })
            }
            disabled={isViewOnly}
            className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 px-0 h-9"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <FileText className="h-3 w-3" /> Reference
          </Label>
          <Input
            value={formData.header?.ref || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                header: { ...formData.header, ref: e.target.value },
              })
            }
            placeholder="SaleOrder or Bill ID"
            disabled={isViewOnly}
            className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 px-0 h-9"
          />
        </div>


      </div>

      {/* Journal Lines */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Journal Items
          </h3>
          {!isViewOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={addLine}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4 mr-1" /> Add a line
            </Button>
          )}
        </div>

        <div className="border border-border/40 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground text-left">
                <th className="px-4 py-3 min-w-[200px]">Account</th>
                <th className="px-4 py-3 min-w-[200px]">Partner</th>
                <th className="px-4 py-3 min-w-[200px]">Label</th>
                <th className="px-4 py-3 text-right w-[120px]">Debit</th>
                <th className="px-4 py-3 text-right w-[120px]">Credit</th>
                {!isViewOnly && <th className="px-4 py-3 w-[50px]"></th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(formData.lineIds || []).map((line: any, idx: number) => (
                <tr
                  key={idx}
                  className="group hover:bg-muted/20 transition-colors"
                >
                  <td className="px-2 py-2">
                    <SelectSearchAdd
                      items={accountOptions}
                      value={line.accountId}
                      onValueChange={(v) => updateLine(idx, "accountId", v)}
                      placeholder={accountsLoading ? "Loading accounts..." : "Select Account"}
                      disabled={accountsLoading}
                      onAdd={onAddAccount}
                      dialogTitle="Create New Account"
                      className="border-none bg-transparent hover:bg-white/50 focus:bg-white"
                      keyField="_id"
                      labelField="name"
                      secondaryField="code"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <SelectSearchAdd
                      items={partners}
                      value={line.partnerId}
                      onValueChange={(v) => updateLine(idx, "partnerId", v)}
                      placeholder="Select Partner"
                      className="border-none bg-transparent hover:bg-white/50 focus:bg-white"
                      keyField="_id"
                      labelField="header.name"
                      onAddClick={() => {
                        setPartnerFormData({
                          header: { name: "", is_company: true, parent_id: "" },
                          contact_details: {
                            email: "",
                            phone: "",
                            mobile: "",
                            website: "",
                          },
                          address_tab: {
                            type: "contact",
                            street: "",
                            street2: "",
                            city: "",
                            zip: "",
                          },
                          sales_purchase_tab: { user_id: "default" },
                          accounting_tab: {
                            property_account_receivable_id: "",
                            property_account_payable_id: "",
                          },
                        });
                        setIsPartnerModalOpen(true);
                      }}
                      addButtonLabel="Add Partner"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      value={line.label || ""}
                      onChange={(e) => updateLine(idx, "label", e.target.value)}
                      placeholder="Description"
                      disabled={isViewOnly}
                      className="border-none shadow-none focus-visible:ring-0 bg-transparent"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      value={line.debit || 0}
                      onChange={(e) =>
                        updateLine(
                          idx,
                          "debit",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      disabled={isViewOnly}
                      className="border-none shadow-none focus-visible:ring-0 bg-transparent text-right font-mono [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      value={line.credit || 0}
                      onChange={(e) =>
                        updateLine(
                          idx,
                          "credit",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      disabled={isViewOnly}
                      className="border-none shadow-none focus-visible:ring-0 bg-transparent text-right font-mono [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>
                  {!isViewOnly && (
                    <td className="px-2 py-2 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(idx)}
                        className="h-8 w-8 text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {formData.lineIds?.length > 0 && (
              <tfoot className="bg-muted/30 font-bold border-t">
                <tr>
                  <td
                    colSpan={3}
                    className="px-6 py-4 text-right uppercase tracking-widest text-[10px] text-muted-foreground"
                  >
                    Totals
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-base border-l">
                    ₹{formData.totalDebit?.toLocaleString() || 0}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-base border-l">
                    ₹{formData.totalCredit?.toLocaleString() || 0}
                  </td>
                  {!isViewOnly && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {formData.totalDebit !== formData.totalCredit &&
          formData.lineIds?.length > 0 && (
            <p className="text-xs text-red-500 font-medium italic animate-pulse">
              * The journal entry must be balanced (Total Debit = Total Credit)
            </p>
          )}
      </div>

      <ModularModal
        open={isPartnerModalOpen}
        onOpenChange={setIsPartnerModalOpen}
        title="Create New Partner"
        description="Add a new customer or vendor to your records."
        className="max-w-[70vw]"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleSavePartner(DOCUMENT_STATUS.DRAFT)}
              disabled={isSubmittingPartner}
            >
              <History className="h-4 w-4 mr-2" /> Save as Draft
            </Button>
            <Button
              onClick={() => handleSavePartner(DOCUMENT_STATUS.POSTED)}
              disabled={isSubmittingPartner}
            >
              {isSubmittingPartner ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Create Partner
            </Button>
          </div>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          <CustomerPopupContent
            formData={partnerFormData}
            setFormData={setPartnerFormData}
            activeTab={activePartnerTab}
            setActiveTab={setActivePartnerTab}
            isViewOnly={false}
            accounts={accounts}
            handleCreateAccount={onAddAccount}
            data={partners}
          />
        </div>
      </ModularModal>
    </div>
  );
}
