"use client";

import { useEffect, useState } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { useSession } from "next-auth/react";

export default function AccountTypesPage() {
  const { data: session } = useSession();
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", segment: "", description: "" });

  const fetchTypes = async () => {
    try {
      const res = await cachedFetch("/api/finance/accounting/account-types");
      const data = await res.json();
      if (res.ok) {
        setTypes(data.accountTypes || []);
      } else {
        toast.error(data.error || "Failed to fetch account types");
      }
    } catch (e) {
      toast.error("Failed to fetch account types");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  const handleCreate = async () => {
    try {
      const res = await cachedFetch("/api/finance/accounting/account-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Account Type created");
        setIsNewModalOpen(false);
        setFormData({ name: "", segment: "", description: "" });
        fetchTypes();
      } else {
        toast.error(data.error || "Failed to create");
      }
    } catch (e) {
      toast.error("An error occurred");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this account type?")) return;
    try {
      const res = await cachedFetch(`/api/finance/accounting/account-types/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        toast.success("Deleted successfully");
        fetchTypes();
      } else {
        toast.error(data.error || "Failed to delete");
      }
    } catch (e) {
      toast.error("An error occurred");
    }
  };

  const filteredTypes = types.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.segment.toLowerCase().includes(search.toLowerCase()));

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Account Types"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Chart of Accounts", href: "/finance/accounting/chart-of-accounts" },
        { label: "Account Types" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Account Types</h1>
          <p className="text-sm text-muted-foreground">Manage reference data for chart of accounts</p>
        </div>
        <Button onClick={() => setIsNewModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New
        </Button>
      </div>

      <div className="flex items-center bg-white dark:bg-accent p-2 rounded-lg border">
        <Search className="h-5 w-5 text-muted-foreground mx-2" />
        <Input 
          className="border-0 focus-visible:ring-0 shadow-none bg-transparent text-foreground dark:text-foreground placeholder:text-muted-foreground" 
          placeholder="Search account types..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white dark:bg-accent rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ACCOUNT TYPE</TableHead>
              <TableHead>ACCOUNT SEGMENT</TableHead>
              <TableHead>DESCRIPTION</TableHead>
              <TableHead>STATUS</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filteredTypes.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">No account types found</TableCell></TableRow>
            ) : (
              filteredTypes.map(t => (
                <TableRow key={t._id}>
                  <TableCell className="font-medium text-blue-600 dark:text-blue-400 cursor-pointer">{t.name}</TableCell>
                  <TableCell>{t.segment}</TableCell>
                  <TableCell className="max-w-md truncate">{t.description}</TableCell>
                  <TableCell>
                    {t.status === "active" ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent text-foreground">
                        INACTIVE
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {!t.isSystem && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleDelete(t._id)} className="text-red-600">
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Account Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Account Segment*</label>
              <Select value={formData.segment} onValueChange={(v) => setFormData({...formData, segment: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select segment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Asset</SelectLabel>
                    <SelectItem value="Other Asset">Other Asset</SelectItem>
                    <SelectItem value="Other Current Asset">Other Current Asset</SelectItem>
                    <SelectItem value="Cash and cash equivalents">Cash and cash equivalents</SelectItem>
                    <SelectItem value="Fixed Asset">Fixed Asset</SelectItem>
                    <SelectItem value="Non Current Asset">Non Current Asset</SelectItem>
                    <SelectItem value="Deferred Tax Asset">Deferred Tax Asset</SelectItem>
                    <SelectItem value="Intangible Asset">Intangible Asset</SelectItem>
                    <SelectItem value="Payment Clearing Account">Payment Clearing Account</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Liability</SelectLabel>
                    <SelectItem value="Other Liability">Other Liability</SelectItem>
                    <SelectItem value="Other Current Liability">Other Current Liability</SelectItem>
                    <SelectItem value="Non Current Liability">Non Current Liability</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Equity</SelectLabel>
                    <SelectItem value="Equity">Equity</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Income</SelectLabel>
                    <SelectItem value="Income">Income</SelectItem>
                    <SelectItem value="Other Income">Other Income</SelectItem>
                    <SelectItem value="Other Comprehensive Income">Other Comprehensive Income</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Expense</SelectLabel>
                    <SelectItem value="Expense">Expense</SelectItem>
                    <SelectItem value="Cost Of Goods Sold">Cost Of Goods Sold</SelectItem>
                    <SelectItem value="Other Expense">Other Expense</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Account Type Name*</label>
              <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Max. 500 characters" maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formData.name || !formData.segment}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
