"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AccountPicker, type PickerAccount } from "@/components/finance/accounting/AccountPicker";
import { useAccountingSettings } from "./useAccountingSettings";

export function TaxSettingsPanel() {
  const { settings, loading, saving, save } = useAccountingSettings();
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [gstin, setGstin] = useState("");
  const [rates, setRates] = useState<any[]>([]);
  const [defaultSalesTaxRateId, setDefaultSalesTaxRateId] = useState("");
  const [defaultPurchaseTaxRateId, setDefaultPurchaseTaxRateId] = useState("");

  useEffect(() => {
    if (settings?.taxSettings) {
      setPricesIncludeTax(settings.taxSettings.pricesIncludeTax);
      setGstin(settings.taxSettings.gstin || "");
      setDefaultSalesTaxRateId(settings.taxSettings.defaultSalesTaxRateId?._id || settings.taxSettings.defaultSalesTaxRateId || "");
      setDefaultPurchaseTaxRateId(settings.taxSettings.defaultPurchaseTaxRateId?._id || settings.taxSettings.defaultPurchaseTaxRateId || "");
    }
  }, [settings]);

  useEffect(() => {
    fetch("/api/finance/accounting/tax-rates?type=gst")
      .then((r) => r.json())
      .then((d) => setRates(d.data || []))
      .catch(() => {});
  }, []);

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>;

  const rateAsAccounts: PickerAccount[] = rates.map((r) => ({ _id: r._id, accountName: `${r.name} (${r.ratePercent}%)` }));

  return (
    <div className="space-y-6 max-w-md">
      <div className="space-y-2">
        <label className="text-sm font-medium">GSTIN</label>
        <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" className="w-64" />
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="pricesIncludeTax" checked={pricesIncludeTax} onCheckedChange={(v) => setPricesIncludeTax(!!v)} />
        <label htmlFor="pricesIncludeTax" className="text-sm">
          Prices are tax inclusive by default
        </label>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Default Sales Tax Rate</label>
        <AccountPicker accounts={rateAsAccounts} value={defaultSalesTaxRateId} onChange={setDefaultSalesTaxRateId} placeholder="Select a tax rate" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Default Purchase Tax Rate</label>
        <AccountPicker
          accounts={rateAsAccounts}
          value={defaultPurchaseTaxRateId}
          onChange={setDefaultPurchaseTaxRateId}
          placeholder="Select a tax rate"
        />
      </div>
      <Button
        disabled={saving}
        onClick={() => save("taxSettings", { pricesIncludeTax, gstin, defaultSalesTaxRateId, defaultPurchaseTaxRateId })}
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
