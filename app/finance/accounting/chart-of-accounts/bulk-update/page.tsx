"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { AccountingSubNav } from "@/components/finance/accounting/AccountingSubNav";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertCircle, FileStack } from "lucide-react";

export default function BulkUpdatePage() {
  const { data: session } = useSession();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Chart of Accounts"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Chart of Accounts" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Top Nav */}
        <AccountingSubNav />

        <div className="flex flex-col items-center justify-center mt-20 text-center max-w-2xl mx-auto">
          <div className="mb-6 w-32 h-32 flex items-center justify-center">
            {/* Simple placeholder for the graphic */}
            <div className="relative">
              <FileStack className="w-24 h-24 text-blue-500 opacity-80" />
              <div className="absolute top-0 right-0 bg-yellow-400 w-6 h-6 rounded-sm shadow transform rotate-12"></div>
              <div className="absolute bottom-0 left-0 bg-purple-500 w-8 h-8 rounded-sm shadow transform -rotate-6"></div>
            </div>
          </div>
          
          <h1 className="text-2xl font-semibold text-foreground mb-2">Bulk Update Accounts In Transactions</h1>
          <p className="text-muted-foreground mb-8">
            Filter transactions (Invoices, Credit Notes, Purchase Orders, Expenses, Bills, Vendor Credits) and bulk-update its accounts with a new account
          </p>

          <div className="bg-[#fff8e1] border border-yellow-200 text-yellow-800 p-4 rounded-md flex items-start text-left mb-8 w-full">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 shrink-0 mt-0.5" />
            <p className="text-sm">
              <span className="font-medium block mb-1">Bulk-updating accounts in transactions will cause significant changes to the financial data</span>
              of your business. We recommend that you do this with the assistance of an accountant.
            </p>
          </div>

          <Button className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-5 rounded-md text-sm font-medium" onClick={() => setModalOpen(true)}>
            Filter and Bulk Update
          </Button>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[600px] p-0">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <DialogTitle className="text-lg font-medium">Filter Transactions</DialogTitle>
          </div>
          
          <div className="p-6 space-y-6">
            <p className="text-sm text-muted-foreground">Select an account and enter your ranges to filter your transaction</p>
            
            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <label className="text-sm font-medium text-red-500">Account*</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="account_1">Test Account</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <label className="text-sm font-medium text-foreground">Contact</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select Contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact_1">Test Contact</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <label className="text-sm font-medium text-foreground">Date Range</label>
              <div className="flex items-center space-x-2">
                <Input type="date" className="flex-1" />
                <span className="text-muted-foreground font-medium">-</span>
                <Input type="date" className="flex-1" />
              </div>
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <label className="text-sm font-medium text-foreground">Total Amount<br/>Range</label>
              <div className="flex items-center space-x-2">
                <Input type="number" className="flex-1" />
                <span className="text-muted-foreground font-medium">-</span>
                <Input type="number" className="flex-1" />
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-muted/30 border-t flex space-x-2 rounded-b-lg">
            <Button className="bg-blue-500 hover:bg-blue-600 text-white px-6">Search</Button>
            <Button variant="outline" className="bg-background" onClick={() => setModalOpen(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
