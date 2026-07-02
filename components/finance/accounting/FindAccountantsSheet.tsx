"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export function FindAccountantsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [accountants, setAccountants] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    if (open && accountants.length === 0) {
      fetch("/api/finance/accounting/accountants")
        .then((r) => r.json())
        .then((d) => setAccountants(d.accountants || []))
        .catch(() => {});
    }
    if (!open) setSelected(null);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto">
        {selected ? (
          <div>
            <Button variant="ghost" onClick={() => setSelected(null)} className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <h2 className="text-2xl font-bold">{selected.name}</h2>
            <p className="text-lg text-muted-foreground">{selected.firmName}</p>
            <div className="mt-6 space-y-4">
              <div>
                <h4 className="font-semibold">Location</h4>
                <p>
                  {selected.state}, {selected.country}
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Contact</h4>
                <p>{selected.email}</p>
                <p>{selected.phone}</p>
              </div>
              {selected.description && (
                <div>
                  <h4 className="font-semibold">Description</h4>
                  <p className="text-sm">{selected.description}</p>
                </div>
              )}
              {selected.servicesOffered?.length > 0 && (
                <div>
                  <h4 className="font-semibold">Services Offered</h4>
                  <ul className="list-disc pl-5 text-sm">
                    {selected.servicesOffered.map((s: string) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <SheetHeader>
              <SheetTitle>Find Accountants</SheetTitle>
            </SheetHeader>
            <p className="text-sm text-muted-foreground mt-2 mb-6">
              Connect with an accountant in your area to manage your business finances with ease.
            </p>
            <div className="space-y-4">
              {accountants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No accountants found.</p>
              ) : (
                accountants.map((acc) => (
                  <div key={acc._id} className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50" onClick={() => setSelected(acc)}>
                    <h3 className="font-semibold text-lg">{acc.name}</h3>
                    <p className="text-sm font-medium">{acc.firmName}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {acc.state}, {acc.country}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
