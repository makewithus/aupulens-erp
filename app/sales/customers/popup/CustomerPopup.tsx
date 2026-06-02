"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Check,
  ChevronsUpDown,
  Plus,
  User,
  Mail,
  Phone,
  Globe,
  MapPin,
  Briefcase,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Local Combobox Component for Accounts
function AccountCombobox({
  items,
  value,
  onValueChange,
  placeholder = "Select account...",
  onAdd,
}: {
  items: any[];
  value: string;
  onValueChange: (val: string) => void;
  placeholder?: string;
  onAdd?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal rounded-none text-foreground border-border"
        >
          {value
            ? items.find((item) => item._id === value)?.name || placeholder
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 rounded-none border-border shadow-xl">
        <Command className="rounded-none">
          <CommandInput placeholder="Search account..." className="h-9" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item._id}
                  value={`${item.code} ${item.name}`}
                  onSelect={() => {
                    onValueChange(item._id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between py-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === item._id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="font-medium text-xs">{item.code}</span>
                    <span className="text-muted-foreground text-sm">
                      {item.name}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {onAdd && (
            <div className="border-t p-1 sticky bottom-0 bg-popover">
              <Button
                variant="ghost"
                className="w-full justify-start text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-none h-9 px-2"
                onClick={() => {
                  onAdd();
                  setOpen(false);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add New Account
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CustomerPopupContent({
  formData,
  setFormData,
  activeTab,
  setActiveTab,
  isViewOnly,
  accounts,
  pricelists,
  users,
  handleCreateAccount,
  data, // all customers for parent company selection
}: any) {
  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);
  console.log(users);
  const [localAccounts, setLocalAccounts] = useState<any[]>([]);
  const [localUsers, setLocalUsers] = useState<any[]>(users || []);
  const [localPricelists, setLocalPricelists] = useState<any[]>([]);

  const effectiveAccounts = Array.from(
    new Map(
      [...(accounts || []), ...localAccounts].map((item: any) => [
        item._id,
        item,
      ]),
    ).values(),
  );
  const effectivePricelists =
    pricelists && pricelists.length > 0 ? pricelists : localPricelists;
  const effectiveUsers = users && users.length > 0 ? users : localUsers;

  /* Account Creation Modal State */
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);
  const [accountFormData, setAccountFormData] = useState<any>({
    code: "",
    name: "",
    account_type: "income",
    parent_id: null,
  });

  // Local handler for creating an account if prop is missing
  const handleLocalCreateAccount = () => {
    setAccountFormData({
      code: "",
      name: "",
      account_type: "income",
      parent_id: null,
    });
    setIsAccountModalOpen(true);
  };

  const handleSaveNewAccount = async () => {
    if (!accountFormData.name || !accountFormData.code) {
      toast.error("Account code and name are required");
      return;
    }

    setIsSubmittingAccount(true);
    try {
      const res = await fetch("/api/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountFormData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create account");
      }
      const newAccount = await res.json();
      toast.success("Account created successfully");
      setLocalAccounts((prev) => [...prev, newAccount]); // Add to local state immediately
      setIsAccountModalOpen(false);
      setRefreshKey((prev) => prev + 1); // Trigger refresh as fallback
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmittingAccount(false);
    }
  };

  const effectiveHandleCreateAccount =
    handleCreateAccount || handleLocalCreateAccount;

  // Effect to fetch missing data if not provided
  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch Accounts if "accounts" prop is missing or empty, OR if we force refreshed
      if (!accounts || accounts.length === 0 || refreshKey > 0) {
        try {
          const res = await fetch("/api/accounting/accounts");
          if (res.ok) {
            const json = await res.json();
            setLocalAccounts(json.items || json.accounts || []);
          }
        } catch (e) {
          console.error("Failed to fetch accounts locally", e);
        }
      }

      // 2. Fetch Users (Salespersons)
      if (!users || users.length === 0) {
        try {
          const res = await fetch("/api/users");
          if (res.ok) {
            const json = await res.json();
            setLocalUsers(json.users || []);
          }
        } catch (e) {
          console.error("Failed to fetch users locally", e);
        }
      }

      // 3. Fetch Pricelists
      if (!pricelists || pricelists.length === 0) {
        try {
          const res = await fetch("/api/sales/pricelists");
          if (res.ok) {
            const json = await res.json();
            setLocalPricelists(json.items || json.pricelists || []);
          }
        } catch (e) {
          console.error("Failed to fetch pricelists locally", e);
        }
      }
    };

    fetchData();
  }, [accounts, users, pricelists, refreshKey]);

  return (
    <>
      <div className="space-y-6">
        {/* Header Section */}
        <div
          className={`space-y-4 ${isViewOnly ? "pointer-events-none opacity-90" : ""}`}
        >
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center rounded-lg relative group">
              <User className="w-12 h-12 text-blue-600 dark:text-blue-400" />
              {!isViewOnly && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer rounded-lg">
                  <span className="text-[10px] text-white font-medium uppercase tracking-tighter">
                    Change
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cust_name">Company / Individual Name *</Label>
                <Input
                  id="cust_name"
                  value={formData.header.name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      header: { ...formData.header, name: e.target.value },
                    })
                  }
                  placeholder="e.g. Acme Corp or John Doe"
                  className="text-lg font-bold"
                />
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_company"
                    checked={formData.header.is_company}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        header: { ...formData.header, is_company: checked },
                      })
                    }
                  />
                  <Label htmlFor="is_company" className="font-semibold">
                    IS A COMPANY?
                  </Label>
                </div>
              </div>
            </div>
          </div>

          {!formData.header.is_company && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label>Parent Company</Label>
                <Select
                  value={formData.header.parent_id}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      header: { ...formData.header, parent_id: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Company..." />
                  </SelectTrigger>
                  <SelectContent>
                    {data
                      ?.filter((c: any) => c.header.is_company)
                      .map((company: any) => (
                        <SelectItem key={company._id} value={company._id}>
                          {company.header.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  type="email"
                  value={formData.contact_details.email}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contact_details: {
                        ...formData.contact_details,
                        email: e.target.value,
                      },
                    })
                  }
                  placeholder="email@example.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={formData.contact_details.phone}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contact_details: {
                        ...formData.contact_details,
                        phone: e.target.value,
                      },
                    })
                  }
                  placeholder="+1 234 567 890"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mobile</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={formData.contact_details.mobile}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contact_details: {
                        ...formData.contact_details,
                        mobile: e.target.value,
                      },
                    })
                  }
                  placeholder="+1 987 654 321"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={formData.contact_details.website}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      contact_details: {
                        ...formData.contact_details,
                        website: e.target.value,
                      },
                    })
                  }
                  placeholder="https://example.com"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="space-y-4">
          <div className="flex border-b overflow-x-auto whitespace-nowrap scrollbar-hide">
            {[
              { id: "address", label: "Address" },
              { id: "sales", label: "Sales & Purchase" },
              { id: "accounting", label: "Accounting" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 capitalize ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="pt-2 min-h-[350px]">
            <div className={isViewOnly ? "pointer-events-none opacity-90" : ""}>
              {activeTab === "address" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Address Type</Label>
                      <Select
                        value={formData.address_tab.type}
                        onValueChange={(v: any) =>
                          setFormData({
                            ...formData,
                            address_tab: {
                              ...formData.address_tab,
                              type: v,
                            },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contact">Contact</SelectItem>
                          <SelectItem value="invoice">
                            Invoice Address
                          </SelectItem>
                          <SelectItem value="delivery">
                            Delivery Address
                          </SelectItem>
                          <SelectItem value="other">Other Address</SelectItem>
                          <SelectItem value="private">
                            Private Address
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Street</Label>
                      <Input
                        value={formData.address_tab.street}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address_tab: {
                              ...formData.address_tab,
                              street: e.target.value,
                            },
                          })
                        }
                        placeholder="Street name..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Street 2</Label>
                      <Input
                        value={formData.address_tab.street2}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address_tab: {
                              ...formData.address_tab,
                              street2: e.target.value,
                            },
                          })
                        }
                        placeholder="Building, Floor..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        value={formData.address_tab.city}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address_tab: {
                              ...formData.address_tab,
                              city: e.target.value,
                            },
                          })
                        }
                        placeholder="City..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>ZIP / Postal Code</Label>
                      <Input
                        value={formData.address_tab.zip}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address_tab: {
                              ...formData.address_tab,
                              zip: e.target.value,
                            },
                          })
                        }
                        placeholder="12345"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "sales" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="border-blue-100 bg-black">
                      <CardHeader className="py-3">
                        <CardTitle className="text-xs font-bold text-blue-700 uppercase tracking-widest">
                          Sales Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>Salesperson</Label>
                          <Select
                            value={formData.sales_purchase_tab.user_id}
                            onValueChange={(v) =>
                              setFormData({
                                ...formData,
                                sales_purchase_tab: {
                                  ...formData.sales_purchase_tab,
                                  user_id: v,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Internal User..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">
                                Default Salesperson
                              </SelectItem>
                              {effectiveUsers.map((user: any) => (
                                <SelectItem key={user._id} value={user._id}>
                                  {user.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Pricelist</Label>
                          <Select
                            value={
                              formData.sales_purchase_tab
                                .property_product_pricelist || "public"
                            }
                            onValueChange={(v) =>
                              setFormData({
                                ...formData,
                                sales_purchase_tab: {
                                  ...formData.sales_purchase_tab,
                                  property_product_pricelist:
                                    v === "public" ? null : v,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Public Pricelist" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="public">
                                Public Pricelist
                              </SelectItem>
                              {effectivePricelists.map((list: any) => (
                                <SelectItem key={list._id} value={list._id}>
                                  {list.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-100 bg-black">
                      <CardHeader className="py-3">
                        <CardTitle className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                          Purchase Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>Payment Terms</Label>
                          <Select
                            value={
                              formData.sales_purchase_tab
                                .property_payment_term_id
                            }
                            onValueChange={(v) =>
                              setFormData({
                                ...formData,
                                sales_purchase_tab: {
                                  ...formData.sales_purchase_tab,
                                  property_payment_term_id: v,
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Immediate Payment" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="immediate">
                                Immediate Payment
                              </SelectItem>
                              <SelectItem value="15">15 Days</SelectItem>
                              <SelectItem value="30">30 Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {activeTab === "accounting" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-blue-600 font-bold flex items-center gap-1">
                          RECEIVABLE ACCOUNT
                          <Badge variant="outline" className="text-[9px] h-4">
                            ASSET
                          </Badge>
                        </Label>
                        <AccountCombobox
                          items={effectiveAccounts}
                          value={
                            formData.accounting_tab
                              .property_account_receivable_id
                          }
                          onValueChange={(v) =>
                            setFormData({
                              ...formData,
                              accounting_tab: {
                                ...formData.accounting_tab,
                                property_account_receivable_id: v,
                              },
                            })
                          }
                          placeholder="Select receivable account..."
                          onAdd={effectiveHandleCreateAccount}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-red-600 font-bold flex items-center gap-1">
                          PAYABLE ACCOUNT
                          <Badge variant="outline" className="text-[9px] h-4">
                            LIABILITY
                          </Badge>
                        </Label>
                        <AccountCombobox
                          items={effectiveAccounts}
                          value={
                            formData.accounting_tab.property_account_payable_id
                          }
                          onValueChange={(v) =>
                            setFormData({
                              ...formData,
                              accounting_tab: {
                                ...formData.accounting_tab,
                                property_account_payable_id: v,
                              },
                            })
                          }
                          placeholder="Select payable account..."
                          onAdd={effectiveHandleCreateAccount}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Nested Account Modal */}
      <ModularModal
        className="z-[60]"
        open={isAccountModalOpen}
        onOpenChange={setIsAccountModalOpen}
        title="Create New Account"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsAccountModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveNewAccount}
              disabled={isSubmittingAccount}
            >
              {isSubmittingAccount ? "Creating..." : "Save Account"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <Label>Account Code *</Label>
            <Input
              value={accountFormData.code}
              onChange={(e) =>
                setAccountFormData({ ...accountFormData, code: e.target.value })
              }
              placeholder="e.g., 4000"
            />
          </div>
          <div className="space-y-2">
            <Label>Account Name *</Label>
            <Input
              value={accountFormData.name}
              onChange={(e) =>
                setAccountFormData({ ...accountFormData, name: e.target.value })
              }
              placeholder="e.g., Sales Revenue"
            />
          </div>
          <div className="space-y-2">
            <Label>Account Type</Label>
            <Select
              value={accountFormData.account_type}
              onValueChange={(val) =>
                setAccountFormData({ ...accountFormData, account_type: val })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[70]">
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="income_other">Income (Other)</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="expense_direct_cost">
                  Expense (Direct Cost)
                </SelectItem>
                <SelectItem value="asset_receivable">
                  Asset (Receivable)
                </SelectItem>
                <SelectItem value="asset_current">Asset (Current)</SelectItem>
                <SelectItem value="liability_payable">
                  Liability (Payable)
                </SelectItem>
                <SelectItem value="equity">Equity</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </ModularModal>
    </>
  );
}
