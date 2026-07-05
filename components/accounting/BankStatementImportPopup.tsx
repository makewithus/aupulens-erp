"use client";

import * as React from "react";
import {
  Upload,
  Calendar as CalendarIcon,
  FileText,
  Landmark,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import { toast } from "sonner";
import { DOCUMENT_STATUS, DocumentStatus } from "@/lib/constants/statuses";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { CustomerPopupContent } from "@/app/sales/customers/popup/CustomerPopup";

interface BankStatementImportPopupProps {
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly?: boolean;
}

export function BankStatementImportPopup({
  formData,
  setFormData,
  isViewOnly = false,
}: BankStatementImportPopupProps) {
  const [accounts, setAccounts] = React.useState<any[]>([]);
  const [partners, setPartners] = React.useState<any[]>([]);

  // Partner Create State
  const [isPartnerModalOpen, setIsPartnerModalOpen] = React.useState(false);
  const [activePartnerTab, setActivePartnerTab] = React.useState("address");
  const [isSubmittingPartner, setIsSubmittingPartner] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
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
    try {
      const res = await fetch("/api/accounting/accounts");
      const data = await res.json();
      setAccounts(data.items || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
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

  const onAddAccount = async (newAcc: any) => {
    try {
      const res = await fetch("/api/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAcc),
      });
      if (!res.ok) throw new Error("Failed to create account");
      const created = await res.json();
      await fetchAccounts();
      return created;
    } catch (error) {
      toast.error("Failed to create account");
      return null;
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
      date: new Date(),
      payment_ref: "",
      partnerId: "",
      amount: 0,
      isReconciled: false,
    });
    setFormData({ ...formData, lineIds: lines });
  };

  const removeLine = (index: number) => {
    const lines = [...formData.lineIds];
    lines.splice(index, 1);
    setFormData({ ...formData, lineIds: lines });
  };

  const updateLine = (index: number, field: string, value: any) => {
    const lines = [...formData.lineIds];
    lines[index] = { ...lines[index], [field]: value };
    setFormData({ ...formData, lineIds: lines });
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const rows = text.split("\n").filter((row) => row.trim());
      // Assume CSV format: Date, Partner Name (optional), Reference, Amount
      // Skip header if it looks like one
      const startIndex = rows[0].toLowerCase().includes("date") ? 1 : 0;

      const newLines = rows.slice(startIndex).map((row) => {
        const columns = row
          .split(",")
          .map((col) => col.trim().replace(/^"|"$/g, ""));
        const date = columns[0] ? new Date(columns[0]) : new Date();
        const partnerName = columns[1] || "";
        const ref = columns[2] || "";
        const amount = parseFloat(columns[3]) || 0;

        // Try to match partnerName with existing partners
        const partner = partners.find(
          (p) =>
            (p.header?.name || p.name || "").toLowerCase() ===
            partnerName.toLowerCase(),
        );

        return {
          date: isNaN(date.getTime()) ? new Date() : date,
          partnerId: partner ? partner._id : "",
          payment_ref: ref,
          amount: amount,
          isReconciled: false,
        };
      });

      setFormData({
        ...formData,
        lineIds: [...(formData.lineIds || []), ...newLines],
      });
      toast.success(`Imported ${newLines.length} lines`);
    };
    reader.readAsText(file);
    // Clear input
    e.target.value = "";
  };

  return (
    <div className="space-y-8 py-4 max-h-[70vh] overflow-y-auto px-1">
      {/* Statement Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <FileText className="h-3 w-3" /> Statement Name
          </Label>
          <Input
            value={formData.header?.name || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                header: { ...formData.header, name: e.target.value },
              })
            }
            placeholder="BNK1/2026/01"
            disabled={isViewOnly}
            className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 px-0 h-9 font-medium"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Landmark className="h-3 w-3" /> Bank Account
          </Label>
          <SelectSearchAdd
            items={accounts}
            value={formData.header?.journalId}
            onValueChange={(v) =>
              setFormData({
                ...formData,
                header: { ...formData.header, journalId: v },
              })
            }
            placeholder="Select Bank Account"
            onAdd={onAddAccount}
            dialogTitle="Create Bank Account"
            keyField="_id"
            labelField="name"
            secondaryField="code"
            className="rounded-none border-t-0 border-x-0 border-b-2 h-9 px-0"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <CalendarIcon className="h-3 w-3" /> Statement Date
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/20 p-6 border rounded-xl">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase text-muted-foreground">
            Starting Balance
          </Label>
          <div className="relative">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">
              ₹
            </span>
            <Input
              type="number"
              value={formData.header?.balance_start || 0}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  header: {
                    ...formData.header,
                    balance_start: parseFloat(e.target.value) || 0,
                  },
                })
              }
              disabled={isViewOnly}
              className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 pl-4 pr-0 h-9 font-mono font-bold"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase text-muted-foreground">
            Ending Balance (Real)
          </Label>
          <div className="relative">
            <span className="absolute left-0 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">
              ₹
            </span>
            <Input
              type="number"
              value={formData.header?.balance_end_real || 0}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  header: {
                    ...formData.header,
                    balance_end_real: parseFloat(e.target.value) || 0,
                  },
                })
              }
              disabled={isViewOnly}
              className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 pl-4 pr-0 h-9 font-mono font-bold"
            />
          </div>
        </div>
      </div>

      {/* Statement Lines */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Statement Lines
          </h3>
          {!isViewOnly && (
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleCSVImport}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                className="rounded-none font-bold"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" /> Import CSV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={addLine}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4 mr-1" /> Add a line
              </Button>
            </div>
          )}
        </div>

        <div className="border border-border/40 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b text-[10px] uppercase font-bold tracking-widest text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3 w-[150px]">Date</th>
                <th className="px-4 py-3 min-w-[200px]">Partner</th>
                <th className="px-4 py-3">Label / Reference</th>
                <th className="px-4 py-3 text-right w-[150px]">Amount</th>
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
                    <Input
                      type="date"
                      value={
                        line.date
                          ? new Date(line.date).toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) => updateLine(idx, "date", e.target.value)}
                      disabled={isViewOnly}
                      className="border-none shadow-none focus-visible:ring-0 bg-transparent"
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
                      value={line.payment_ref || ""}
                      onChange={(e) =>
                        updateLine(idx, "payment_ref", e.target.value)
                      }
                      placeholder="e.g. TRF/SAL/2026/001"
                      disabled={isViewOnly}
                      className="border-none shadow-none focus-visible:ring-0 bg-transparent font-medium"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      value={line.amount || 0}
                      onChange={(e) =>
                        updateLine(
                          idx,
                          "amount",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      disabled={isViewOnly}
                      className="border-none shadow-none focus-visible:ring-0 bg-transparent text-right font-mono font-bold"
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
          </table>
        </div>
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
