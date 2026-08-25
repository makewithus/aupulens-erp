"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import {
  Truck,
  Plus,
  Star,
  Activity,
  BarChart3,
  Search,
  MoreVertical,
  ArrowUpDown,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { FullPageLoadingSkeleton } from "@/components/ui/loading-skeletons";

export default function VendorsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [vendors, setVendors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<any | null>(null);
  const [newVendor, setNewVendor] = useState({
    name: "",
    category: "",
    contactEmail: "",
    performanceMetrics: { deliveryTime: 5, qualityScore: 8, costRating: 7 },
  });
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortBy, setSortBy] = useState("name");

  // Analysis Popup State
  const [analysisVendor, setAnalysisVendor] = useState<any | null>(null);

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      const response = await fetch("/api/admin/vendors");
      const data = await response.json();
      if (response.ok) {
        setVendors(data.vendors);
      }
    } catch (error) {
      console.error("Error fetching vendors:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateVendor = async () => {
    try {
      const method = editingVendor ? "PUT" : "POST";
      const body = editingVendor
        ? { ...newVendor, _id: editingVendor._id }
        : newVendor;

      const response = await fetch("/api/admin/vendors", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        toast.success(editingVendor ? "Vendor Updated" : "Vendor Added", {
          description: editingVendor
            ? "Vendor details updated successfully."
            : "New vendor added successfully.",
        });
        setIsDialogOpen(false);
        setEditingVendor(null);
        setNewVendor({
          name: "",
          category: "",
          contactEmail: "",
          performanceMetrics: {
            deliveryTime: 5,
            qualityScore: 8,
            costRating: 7,
          },
        });
        fetchVendors();
      }
    } catch (error) {
      toast.error("Failed to save vendor.");
    }
  };

  const handleEditVendor = (vendor: any) => {
    setEditingVendor(vendor);
    setNewVendor({
      name: vendor.name,
      category: vendor.category,
      contactEmail: vendor.contactEmail || "",
      performanceMetrics: {
        deliveryTime: vendor.performanceMetrics.deliveryTime,
        qualityScore: vendor.performanceMetrics.qualityScore,
        costRating: vendor.performanceMetrics.costRating,
      },
    });
    setIsDialogOpen(true);
  };

  const handleEvaluate = async (id: string) => {
    setEvaluatingId(id);
    try {
      const response = await fetch("/api/admin/vendors/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: id }),
      });

      if (response.ok) {
        toast.success("Evaluation Complete", {
          description: "AI analysis updated.",
        });
        fetchVendors();
      }
    } catch (error) {
      toast.error("Evaluation failed.");
    } finally {
      setEvaluatingId(null);
    }
  };

  const getFilteredAndSortedVendors = () => {
    let filtered = vendors.filter((vendor) => {
      const matchesSearch =
        vendor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vendor.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        filterCategory === "all" || vendor.category === filterCategory;

      return matchesSearch && matchesCategory;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "rating")
        return (b.aiAnalysis?.rating || 0) - (a.aiAnalysis?.rating || 0);
      if (sortBy === "delivery")
        return (
          a.performanceMetrics.deliveryTime - b.performanceMetrics.deliveryTime
        );
      return 0;
    });
  };

  const formatAnalysisText = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      // Handle bold text (**text**)
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <p key={i} className="mb-2 text-sm text-foreground leading-relaxed">
          {parts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={j} className="text-white font-semibold">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return part;
          })}
        </p>
      );
    });
  };

  if (status === "loading") return <FullPageLoadingSkeleton />;

  const filteredVendors = getFilteredAndSortedVendors();
  const categories = Array.from(new Set(vendors.map((v) => v.category)));

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin Dashboard"
      pageName="Vendors"
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Vendors" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      profilePath="/admin/profile"
    >
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-white">Vendor Evaluation</h2>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vendors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full md:w-[140px] h-9">
                <Filter className="mr-2 h-3 w-3" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat: any) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full md:w-[140px] h-9">
                <ArrowUpDown className="mr-2 h-3 w-3" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="rating">AI Rating</SelectItem>
                <SelectItem value="delivery">Delivery Time</SelectItem>
              </SelectContent>
            </Select>

            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  setEditingVendor(null);
                  setNewVendor({
                    name: "",
                    category: "",
                    contactEmail: "",
                    performanceMetrics: {
                      deliveryTime: 5,
                      qualityScore: 8,
                      costRating: 7,
                    },
                  });
                }
              }}
            >
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9">
                  <Plus className="mr-2 h-4 w-4" /> Add Vendor
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border text-white">
                <DialogHeader>
                  <DialogTitle>
                    {editingVendor ? "Edit Vendor" : "Add New Vendor"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label>Name</label>
                    <Input
                      value={newVendor.name}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, name: e.target.value })
                      }
                      className="bg-accent border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <label>Category</label>
                    <Input
                      value={newVendor.category}
                      onChange={(e) =>
                        setNewVendor({ ...newVendor, category: e.target.value })
                      }
                      className="bg-accent border-border"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-2">
                      <label className="text-xs">Delivery (Days)</label>
                      <Input
                        type="number"
                        value={newVendor.performanceMetrics.deliveryTime}
                        onChange={(e) =>
                          setNewVendor({
                            ...newVendor,
                            performanceMetrics: {
                              ...newVendor.performanceMetrics,
                              deliveryTime: parseInt(e.target.value),
                            },
                          })
                        }
                        className="bg-accent border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs">Quality (1-10)</label>
                      <Input
                        type="number"
                        value={newVendor.performanceMetrics.qualityScore}
                        onChange={(e) =>
                          setNewVendor({
                            ...newVendor,
                            performanceMetrics: {
                              ...newVendor.performanceMetrics,
                              qualityScore: parseInt(e.target.value),
                            },
                          })
                        }
                        className="bg-accent border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs">Cost (1-10)</label>
                      <Input
                        type="number"
                        value={newVendor.performanceMetrics.costRating}
                        onChange={(e) =>
                          setNewVendor({
                            ...newVendor,
                            performanceMetrics: {
                              ...newVendor.performanceMetrics,
                              costRating: parseInt(e.target.value),
                            },
                          })
                        }
                        className="bg-accent border-border"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateVendor}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {editingVendor ? "Update Vendor" : "Add Vendor"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* AI Analysis Popup */}
            <Dialog
              open={!!analysisVendor}
              onOpenChange={() => setAnalysisVendor(null)}
            >
              <DialogContent className="bg-card border-border text-white max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <Activity className="h-5 w-5 text-blue-400" />
                    AI Analysis: {analysisVendor?.name}
                  </DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div className="flex items-center justify-between bg-accent/50 p-3 rounded-lg">
                    <div className="text-sm text-muted-foreground">Overall Rating</div>
                    <div
                      className={`text-lg font-bold px-3 py-1 rounded ${
                        analysisVendor?.aiAnalysis?.rating >= 8
                          ? "bg-green-900/50 text-green-400"
                          : analysisVendor?.aiAnalysis?.rating >= 6
                          ? "bg-yellow-900/50 text-yellow-400"
                          : "bg-red-900/50 text-red-400"
                      }`}
                    >
                      {analysisVendor?.aiAnalysis?.rating}/10
                    </div>
                  </div>

                  <div className="bg-accent/30 p-4 rounded-lg border border-border">
                    {formatAnalysisText(analysisVendor?.aiAnalysis?.summary)}
                  </div>

                  <div className="text-xs text-muted-foreground text-right">
                    Last updated:{" "}
                    {analysisVendor?.aiAnalysis?.lastUpdated &&
                      new Date(
                        analysisVendor.aiAnalysis.lastUpdated
                      ).toLocaleString()}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => setAnalysisVendor(null)}
                    className="bg-accent hover:bg-accent"
                  >
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVendors.map((vendor) => (
            <Card
              key={vendor._id}
              className="bg-card/50 border-border hover:border-border transition-colors group relative"
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleEditVendor(vendor)}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>

              <CardHeader className="pb-2">
                <div className="flex justify-between items-start pr-6">
                  <div>
                    <CardTitle className="text-lg font-medium text-white">
                      {vendor.name}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                      {vendor.category}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1 bg-accent px-2 py-1 rounded">
                    <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                    <span className="text-xs text-white">
                      {vendor.performanceMetrics.qualityScore}/10
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="bg-accent/50 p-2 rounded">
                    <div className="text-xs text-muted-foreground">Delivery</div>
                    <div className="text-sm font-medium text-white">
                      {vendor.performanceMetrics.deliveryTime}d
                    </div>
                  </div>
                  <div className="bg-accent/50 p-2 rounded">
                    <div className="text-xs text-muted-foreground">Quality</div>
                    <div className="text-sm font-medium text-white">
                      {vendor.performanceMetrics.qualityScore}
                    </div>
                  </div>
                  <div className="bg-accent/50 p-2 rounded">
                    <div className="text-xs text-muted-foreground">Cost</div>
                    <div className="text-sm font-medium text-white">
                      {vendor.performanceMetrics.costRating}
                    </div>
                  </div>
                </div>

                {vendor.aiAnalysis?.summary ? (
                  <div className="bg-blue-900/20 border border-blue-900/50 p-3 rounded mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="h-3 w-3 text-blue-400" />
                      <span className="text-xs font-medium text-blue-400">
                        AI Analysis
                      </span>
                    </div>
                    <p className="text-xs text-foreground line-clamp-2 mb-2">
                      {vendor.aiAnalysis.summary.replace(/\*\*/g, "")}
                    </p>
                    <div className="flex items-center justify-between">
                      <Button
                        variant="link"
                        className="text-blue-400 text-xs p-0 h-auto"
                        onClick={() => setAnalysisVendor(vendor)}
                      >
                        View Full Analysis
                      </Button>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          vendor.aiAnalysis.rating >= 8
                            ? "bg-green-900/50 text-green-400"
                            : vendor.aiAnalysis.rating >= 6
                            ? "bg-yellow-900/50 text-yellow-400"
                            : "bg-red-900/50 text-red-400"
                        }`}
                      >
                        {vendor.aiAnalysis.rating}/10
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-accent/30 p-3 rounded mb-4 text-center text-xs text-muted-foreground">
                    No AI analysis yet
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-border hover:bg-accent text-foreground"
                  onClick={() => handleEvaluate(vendor._id)}
                  disabled={evaluatingId === vendor._id}
                >
                  {evaluatingId === vendor._id ? (
                    <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <BarChart3 className="h-3 w-3 mr-2" />
                  )}
                  Evaluate Performance
                </Button>
              </CardContent>
            </Card>
          ))}

          {filteredVendors.length === 0 && !isLoading && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No vendors found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
