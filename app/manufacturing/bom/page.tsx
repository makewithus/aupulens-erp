"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { manufacturingSidebarConfig } from "@/config/sidebar/manufacturing";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  FileText,
  Loader2,
  RefreshCcw,
  Eye,
  Edit3,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BillOfMaterialPopup } from "@/app/inventory/operations/popups/BillOfMaterialPopup";
import { toast } from "sonner";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";

export default function BillOfMaterialsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [boms, setBoms] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBom, setSelectedBom] = useState<any>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);

  // Initial Form State
  const initialFormState = {
    header: {
      productId: "",
      bomType: "mrp",
      quantity: 1.0,
      reference: "",
    },
    components_tab: [],
    miscellaneous: {
      flexibleConsumption: "allowed",
      manufLeadTime: 0,
      prepTime: 0,
      batchSize: 1,
    },
    chatter: [],
    active: true,
  };

  const [formData, setFormData] = useState(initialFormState);

  // Auth Check
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/manufacturing");
    }
  }, [status, router]);

  // Fetch Data
  const fetchBoms = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/manufacturing/bom");
      const data = await res.json();
      if (data.boms) setBoms(data.boms);
    } catch (error) {
      console.error("Failed to fetch BoMs", error);
      toast.error("Failed to fetch Bills of Materials");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/products");
      const data = await res.json();
      if (data.items) setProducts(data.items);
    } catch (error) {
      console.error("Failed to fetch products", error);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchBoms();
      fetchProducts();
    }
  }, [status, fetchBoms, fetchProducts]);

  // Handlers
  const handleCreate = () => {
    setFormData(initialFormState);
    setSelectedBom(null);
    setIsViewOnly(false);
    setIsModalOpen(true);
  };

  const handleEdit = (bom: any) => {
    setFormData(bom);
    setSelectedBom(bom);
    setIsViewOnly(false); // Open in edit mode
    setIsModalOpen(true);
  };

  // AI-native: extract the finished product + components → open the BOM modal
  // pre-filled. Products/components are resolved to real ids server-side when
  // named; the user reviews and clicks Save.
  useAiPrefill("bom", (p) => {
    const d = p.data || {};
    setFormData({
      ...initialFormState,
      header: {
        productId: d.productId || "",
        bomType: d.bomType || "mrp",
        quantity: Number(d.quantity) > 0 ? Number(d.quantity) : 1,
        reference: d.reference || "",
      },
      components_tab: Array.isArray(d.components)
        ? d.components.map((c: any) => ({ productId: c.productId || "", quantity: Number(c.quantity) > 0 ? Number(c.quantity) : 1 }))
        : [],
    });
    setSelectedBom(null);
    setIsViewOnly(false);
    setIsModalOpen(true);
  });

  const handleView = (bom: any) => {
    setFormData(bom);
    setSelectedBom(bom);
    setIsViewOnly(true);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    // Basic validation
    if (!formData.header.productId) {
      toast.error("Please select a product");
      return;
    }

    try {
      setIsSaving(true);
      const method = selectedBom ? "PATCH" : "POST";
      const url = selectedBom
        ? `/api/manufacturing/bom/${selectedBom._id}`
        : "/api/manufacturing/bom";

      // Transform form data if needed (e.g., extract IDs from objects)
      const payload = {
        ...formData,
        header: {
          ...formData.header,
          productId:
            (formData.header.productId as any)?._id ||
            formData.header.productId,
        },
        components_tab: formData.components_tab.map((comp: any) => ({
          ...comp,
          productId: comp.productId?._id || comp.productId,
        })),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchBoms();
        toast.success(
          selectedBom ? "BoM updated successfully" : "BoM created successfully",
        );
      } else {
        const errorData = await res.json();
        console.error("Failed to save BoM", errorData);
        toast.error(
          `Failed to save BoM: ${errorData.error || "Unknown error"}`,
        );
      }
    } catch (error) {
      console.error("Save error", error);
      toast.error("An error occurred while saving the BoM");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: "Are you sure you want to delete this BoM?" })) return;
    try {
      const res = await fetch(`/api/manufacturing/bom/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchBoms();
        toast.success("BoM deleted successfully");
      } else {
        toast.error("Failed to delete BoM");
      }
    } catch (e) {
      console.error("Delete failed", e);
      toast.error("An error occurred while deleting");
    }
  };

  // Filter
  const filteredBoms = boms.filter(
    (bom: any) =>
      bom.header?.productId?.header?.name
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      bom.header?.reference?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing"
      pageName="Bills of Materials"
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/manufacturing" })}
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex gap-2">
            <Button
              onClick={handleCreate}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Plus className="h-4 w-4 mr-2" /> New
            </Button>
            <Button variant="outline" onClick={fetchBoms} disabled={isLoading}>
              <RefreshCcw
                className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />{" "}
              Refresh
            </Button>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products, refs..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {/* <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button> */}
          </div>
        </div>

        {/* List View */}
        <div className="bg-card rounded-md border shadow-sm">
          {isLoading ? (
            <TableSkeleton rows={5} columns={5} />
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-full divide-y divide-border">
                <TableHeader className="bg-muted/50">
                  <TableRow className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <TableHead className="px-6 py-3 text-left">Product</TableHead>
                    <TableHead className="px-6 py-3 text-left">Reference</TableHead>
                    <TableHead className="px-6 py-3 text-left">BoM Type</TableHead>
                    <TableHead className="px-6 py-3 text-left">Quantity</TableHead>
                    <TableHead className="px-6 py-3 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-background divide-y divide-border">
                  {filteredBoms.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="px-6 py-8 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <FileText className="h-8 w-8 mb-2 opacity-20" />
                          <p>No Bills of Materials found.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBoms.map((bom: any) => (
                      <TableRow
                        key={bom._id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <TableCell className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3 rounded-md">
                              <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <div className="text-sm font-medium">
                                {bom.header?.productId?.header?.name ||
                                  "Unknown Product"}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {
                                  bom.header?.productId?.tab_general_information
                                    ?.default_code
                                }
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {bom.header?.reference || "-"}
                        </TableCell>
                        <TableCell className="px-6 py-4 whitespace-nowrap">
                          <Badge
                            variant={
                              bom.header?.bomType === "kit"
                                ? "secondary"
                                : "default"
                            }
                            className="text-[10px] capitalize border-0"
                          >
                            {bom.header?.bomType === "mrp"
                              ? "Manufacturing"
                              : "Kit"}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                          {bom.header?.quantity}
                        </TableCell>
                        <TableCell className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleView(bom)}
                            >
                              <Eye className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(bom)}
                            >
                              <Edit3 className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDelete(bom._id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          selectedBom
            ? isViewOnly
              ? selectedBom.header?.productId?.header?.name
              : "Edit BoM"
            : "New Bill of Material"
        }
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Close
            </Button>
            {isViewOnly ? (
              <Button onClick={() => setIsViewOnly(false)}>Edit</Button>
            ) : (
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            )}
          </div>
        }
        contentClassName="max-w-[80vw]"
      >
        <BillOfMaterialPopup
          formData={formData}
          setFormData={setFormData}
          isViewOnly={isViewOnly}
          products={products}
          onRefresh={() => {
            fetchBoms();
            fetchProducts();
          }}
          currentUser={session?.user}
          nextReference={`BOM/${String(boms.length + 1).padStart(3, "0")}`}
        />
      </ModularModal>
    </DashboardLayout>
  );
}
