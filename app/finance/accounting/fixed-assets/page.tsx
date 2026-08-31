"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";


import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Calculator,
  History,
  Trash2,
  Calendar,
  HardDrive,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { AssetPopupContent } from "@/components/accounting/AssetPopupContent";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";

export default function FixedAssetsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [computeResult, setComputeResult] = useState<any>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const qs = params.toString();
      const res = await cachedFetch(`/api/finance/assets${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      setAssets(json.items || []);
    } catch (error) {
      toast.error("Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleOpenCreate = () => {
    setFormData({
      name: "",
      purchaseDate: new Date(),
      originalValue: 0,
      salvageValue: 0,
      method: "linear",
      durationYears: 5,
      accounts: {
        assetAccountId: "",
        depreciationAccountId: "",
      },
      status: "draft",
    });
    setIsModalOpen(true);
  };

  const handleOpenView = (asset: any) => {
    setFormData(asset);
    setIsModalOpen(true);
  };

  // AI-native: extract the asset details → open the create modal pre-filled.
  // Account ids are resolved server-side when named; the user reviews/picks the
  // asset & depreciation accounts and clicks Save.
  useAiPrefill("fixed_asset", (p) => {
    const d = p.data || {};
    setFormData({
      name: d.name || "",
      purchaseDate: d.purchaseDate ? new Date(d.purchaseDate) : new Date(),
      originalValue: Number(d.originalValue) || 0,
      salvageValue: Number(d.salvageValue) || 0,
      method: d.method === "degressive" ? "degressive" : "linear",
      durationYears: Number(d.durationYears) > 0 ? Number(d.durationYears) : 5,
      accounts: {
        assetAccountId: d.accounts?.assetAccountId || "",
        depreciationAccountId: d.accounts?.depreciationAccountId || "",
      },
      status: "draft",
    });
    setIsModalOpen(true);
  });

  const handleSubmit = async () => {
    if (
      !formData.name ||
      !formData.originalValue ||
      !formData.accounts?.assetAccountId
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const isUpdate = !!formData._id;
      const url = isUpdate
        ? `/api/finance/assets/${formData._id}`
        : "/api/finance/assets";

      const res = await cachedFetch(url, {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to save asset");

      toast.success(isUpdate ? "Asset updated" : "Asset registered");
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: "Are you sure you want to delete this asset?" })) return;
    try {
      const res = await cachedFetch(`/api/finance/assets/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Asset deleted");
        load();
      } else {
        toast.error("Failed to delete asset");
      }
    } catch (error) {
      toast.error("Delete error");
    }
  };

  const handleConfirm = async (asset: any) => {
    try {
      const res = await cachedFetch(`/api/finance/assets/${asset._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "running" }),
      });
      if (res.ok) {
        toast.success("Asset confirmed and now running");
        load();
      } else {
        toast.error("Failed to confirm asset");
      }
    } catch (error) {
      toast.error("Confirm error");
    }
  };

  const handleCompute = async (assetId: string) => {
    try {
      const res = await cachedFetch("/api/finance/assets/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      if (res.ok) {
        const json = await res.json();
        setComputeResult(json.journalEntry);
        setIsResultModalOpen(true);
        load();
      } else {
        const json = await res.json();
        toast.error(json.error || "Failed to compute depreciation");
      }
    } catch (error) {
      toast.error("Compute error");
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Fixed Assets"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Fixed Assets" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "finance"}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={load}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Fixed Assets
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage company assets and track depreciation
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" /> Register Asset
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            [1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))
          ) : assets.length === 0 ? (
            <Card className="col-span-full py-20 flex flex-col items-center justify-center border-dashed bg-muted/5">
              <HardDrive className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <p className="text-muted-foreground font-medium">
                No recorded assets found
              </p>
              <Button
                variant="link"
                onClick={handleOpenCreate}
                className="mt-2 text-primary"
              >
                Register your first asset
              </Button>
            </Card>
          ) : (
            assets.map((asset) => (
              <Card
                key={asset._id}
                className="overflow-hidden group hover:border-primary/50 transition-all shadow-sm hover:shadow-md"
              >
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <HardDrive className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg leading-tight">
                          {asset.name}
                        </h3>
                        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">
                          {asset.method} 法
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        asset.status === "running" ? "default" : "secondary"
                      }
                      className="rounded-none uppercase text-[10px] font-bold h-5 px-2"
                    >
                      {asset.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 my-6">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                        Purchase Value
                      </p>
                      <p className="text-xl font-black text-primary">
                        ₹{asset.originalValue.toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                        Duration
                      </p>
                      <p className="text-xl font-black">
                        {asset.durationYears}{" "}
                        <span className="text-xs font-medium text-muted-foreground">
                          Years
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-4 border-t">
                    {asset.status === "draft" ? (
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 rounded-none font-bold"
                        onClick={() => handleConfirm(asset)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 rounded-none font-bold"
                        disabled={asset.status !== "running"}
                        onClick={() => handleCompute(asset._id)}
                      >
                        <Calculator className="h-4 w-4 mr-2" /> Compute
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-none bg-muted/20"
                      onClick={() => handleOpenView(asset)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-none text-muted-foreground hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(asset._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={formData?.name || "Register New Asset"}
        className="max-w-4xl"
        footer={
          <div className="flex justify-end gap-3 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="rounded-none"
            >
              Cancel
            </Button>
            {formData?.status === "draft" && (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-none font-bold"
              >
                {isSubmitting ? "Registering..." : "Save Asset"}
              </Button>
            )}
          </div>
        }
      >
        {formData && (
          <AssetPopupContent
            formData={formData}
            setFormData={setFormData}
            isViewOnly={formData.status !== "draft"}
          />
        )}
      </ModularModal>

      <ModularModal
        open={isResultModalOpen}
        onOpenChange={setIsResultModalOpen}
        title="Depreciation Calculated"
        className="max-w-md"
        footer={
          <Button
            onClick={() => setIsResultModalOpen(false)}
            className="w-full"
          >
            Great!
          </Button>
        }
      >
        {computeResult && (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center justify-center text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h4 className="text-lg font-bold">Entry Posted Successfully</h4>
                <p className="text-sm text-muted-foreground">
                  A new depreciation entry has been added to your ledger.
                </p>
              </div>
            </div>

            <div className="bg-muted/30 rounded-xl p-4 border space-y-3">
              <div className="flex justify-between items-center text-sm border-b pb-2">
                <span className="text-muted-foreground">Entry Number</span>
                <span className="font-mono font-bold">
                  {computeResult.header?.name}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm border-b pb-2">
                <span className="text-muted-foreground">Asset Reference</span>
                <span className="font-bold">{computeResult.header?.ref}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-1">
                <span className="text-muted-foreground font-medium">
                  Monthly Amount
                </span>
                <span className="text-lg font-black text-primary">
                  ₹{computeResult.totals?.amountTotal?.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest text-center">
                Ledger Impact
              </p>
              <div className="space-y-1">
                {computeResult.lineIds?.map((line: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center text-xs p-2 bg-accent rounded border border-border/40"
                  >
                    <span className="truncate max-w-[150px]">{line.label}</span>
                    <span
                      className={
                        line.debit > 0
                          ? "text-green-600 font-bold"
                          : "text-muted-foreground"
                      }
                    >
                      {line.debit > 0
                        ? `+ ₹${line.debit}`
                        : `- ₹${line.credit}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </ModularModal>
    </DashboardLayout>
  );
}
