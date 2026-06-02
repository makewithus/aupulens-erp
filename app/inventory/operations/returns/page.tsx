"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Eye,
  Edit2,
  Trash2,
  CheckCircle,
  Clock,
  ArrowRight,
  Undo2,
  Shuffle,
  History,
  AlertCircle,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { StockTransferPopup } from "@/app/inventory/operations/popups/StockTransferPopup";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/loading-skeletons";

export default function ReturnsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resources
  const [partners, setPartners] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchReturns();
      fetchResources();
    }
  }, [status]);

  const fetchResources = async () => {
    try {
      const [pRes, cRes, uRes] = await Promise.all([
        fetch("/api/sales/products?limit=100"),
        fetch("/api/sales/customers"),
        fetch("/api/users"),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setProducts(d.items || []);
      }
      if (cRes.ok) {
        const d = await cRes.json();
        setPartners(d.items || []);
      }
      if (uRes.ok) {
        const d = await uRes.json();
        setUsers(d.users || []);
      }
    } catch (e) {
      console.error("Failed to fetch resources", e);
    }
  };

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/inventory/operations/returns");
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      toast.error("Failed to load returns");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setFormData({
      header: {
        name: "",
        operationType: "outgoing",
        scheduledDate: new Date(),
        sourceDocument: "",
      },
      operations_tab: [],
      additional_info: {},
      status: "draft",
    });
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  const handleView = (t: any) => {
    setFormData(t);
    setIsViewOnly(true);
    setIsModalOpen(true);
  };

  const handleEdit = (t: any) => {
    setFormData(t);
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/inventory/operations/transfers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Marked as ${newStatus}`);
      fetchReturns();
    } catch (e) {
      toast.error("Update failed");
    }
  };

  const saveReturn = async () => {
    setIsSubmitting(true);
    try {
      const url = formData._id
        ? `/api/inventory/operations/transfers/${formData._id}`
        : "/api/inventory/operations/returns";
      const method = formData._id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to save");
      toast.success("Return document saved");
      setIsModalOpen(false);
      fetchReturns();
    } catch (e) {
      toast.error("Error saving return");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      dashboardTitle="Inventory"
      pageName="Returns"
      breadcrumbs={[{ label: "Operations" }, { label: "Returns" }]}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h1 className="text-3xl font-black uppercase tracking-tighter text-primary">
              Returns
            </h1>
            <p className="text-xs font-bold text-muted-foreground uppercase opacity-60">
              Manage reversed stock operations and supplier returns
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="none-xl h-12 px-6 font-black uppercase text-xs tracking-widest bg-primary shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all"
          >
            <Shuffle className="h-4 w-4 mr-2" /> New Return
          </Button>
        </div>

        <Card className="rounded-4xl border-2 shadow-xl overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={5} columns={5} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b-2">
                    <tr className="text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                      <th className="p-6">Reference</th>
                      <th className="p-6">Partner</th>
                      <th className="p-6">Source Doc</th>
                      <th className="p-6">Scheduled Date</th>
                      <th className="p-6 text-center">Status</th>
                      <th className="p-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 border-primary/5">
                    {items.map((t) => (
                      <tr
                        key={t._id}
                        className="hover:bg-primary/5 transition-colors group cursor-pointer"
                        onClick={() => handleView(t)}
                      >
                        <td className="p-6 font-black tracking-tight">
                          {t.header.name}
                        </td>
                        <td className="p-6 font-bold opacity-60">
                          {t.header.partnerId?.header?.name || "-"}
                        </td>
                        <td className="p-6">
                          <div className="flex items-center gap-2">
                            <History className="h-3.5 w-3.5 text-primary opacity-40" />
                            <span className="font-bold text-xs uppercase tracking-tight">
                              {t.header.sourceDocument || "-"}
                            </span>
                          </div>
                        </td>
                        <td className="p-6 font-medium text-muted-foreground text-xs uppercase">
                          {new Date(t.header.scheduledDate).toLocaleDateString(
                            "en-IN",
                            { day: "2-digit", month: "short", year: "numeric" },
                          )}
                        </td>
                        <td className="p-6 text-center">
                          <Badge
                            className={`none-full px-3 py-1 uppercase text-[9px] font-black border-2 ${
                              t.status === "done"
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : t.status === "draft"
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                  : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                            }`}
                          >
                            {t.status}
                          </Badge>
                        </td>
                        <td
                          className="p-6 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end gap-2">
                            {t.status !== "done" && t.status !== "cancel" && (
                              <Button
                                size="sm"
                                className="h-9 none-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-widest px-4"
                                onClick={() => updateStatus(t._id, "done")}
                              >
                                Validate
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 none-xl hover:bg-primary/10 transition-all"
                              onClick={() => handleView(t)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {items.length === 0 && (
                  <div className="p-20 text-center flex flex-col items-center gap-3 opacity-20">
                    <Shuffle className="h-20 w-20" />
                    <p className="font-black uppercase tracking-widest">
                      No returns found
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={formData?.header?.name || "Return Document"}
        className="max-w-[1400px]"
        footer={
          <div className="flex justify-between items-center w-full px-6 py-4 bg-muted/5 border-t">
            <div className="flex items-center gap-4">
              {formData?.status === "draft" && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 none-lg border border-amber-200">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-[10px] font-black uppercase tracking-tight">
                    Draft Document
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setIsModalOpen(false)}
                className="font-bold underline text-xs uppercase"
              >
                {isViewOnly ? "Close" : "Discard"}
              </Button>
              {!isViewOnly && (
                <Button
                  onClick={saveReturn}
                  disabled={isSubmitting}
                  className="none-xl h-11 px-8 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20"
                >
                  {isSubmitting ? "Processing..." : "Save Record"}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {formData && (
          <StockTransferPopup
            formData={formData}
            setFormData={setFormData}
            isViewOnly={isViewOnly}
            operationType="outgoing"
            partners={partners}
            products={products}
            users={users}
            onRefresh={fetchReturns}
            currentUser={session?.user}
          />
        )}
      </ModularModal>
    </DashboardLayout>
  );
}
