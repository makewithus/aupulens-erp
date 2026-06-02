"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Link as LinkIcon,
  Upload,
  ArrowRightLeft,
  Search,
  Building,
  Plus,
} from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { BankStatementImportPopup } from "@/components/accounting/BankStatementImportPopup";

export default function BankReconciliationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [statements, setStatements] = useState<any[]>([]); // Bank moves
  const [journalLines, setJournalLines] = useState<any[]>([]); // ERP moves
  const [loading, setLoading] = useState(true);
  const [selectedStatement, setSelectedStatement] = useState<any>(null);
  const [selectedJournal, setSelectedJournal] = useState<any>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch open bank statements and open journal items
      const [stmtRes, ledgerRes] = await Promise.all([
        fetch("/api/finance/bank/statements?status=open"),
        fetch("/api/finance/journal-items?reconciled=false"), // Corrected endpoint
      ]);
      const stmts = await stmtRes.json();
      const ledger = await ledgerRes.json();

      // Flatten all open lines from all open statements
      let stmtLines: any[] = [];
      (stmts.items || []).forEach((s: any) => {
        (s.lineIds || [])
          .filter((l: any) => !l.isReconciled)
          .forEach((l: any) => {
            stmtLines.push({ ...l, statementId: s._id });
          });
      });

      setStatements(stmtLines);
      setJournalLines(ledger.items || []);
    } catch (error) {
      console.error("Load error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/finance");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const handleOpenImport = () => {
    setFormData({
      header: {
        name: "",
        journalId: "",
        date: new Date(),
        balance_start: 0,
        balance_end_real: 0,
      },
      lineIds: [],
      status: "open",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (
      !formData.header?.name ||
      !formData.header?.journalId ||
      formData.lineIds?.length === 0
    ) {
      toast.error(
        "Please fill in all header details and add at least one line",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/finance/bank/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to import statement");

      toast.success("Statement imported successfully");
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReconcile = async () => {
    if (!selectedStatement || !selectedJournal) {
      toast.warning("Select one line from each side");
      return;
    }

    try {
      const res = await fetch("/api/finance/bank/reconcile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statementId: selectedStatement.statementId,
          lineId: selectedStatement._id,
          journalEntryId: selectedJournal.journalEntryId,
          journalLineId: selectedJournal.journalLineId,
        }),
      });

      if (res.ok) {
        toast.success("Reconciled successfully");
        setSelectedStatement(null);
        setSelectedJournal(null);
        load();
      }
    } catch (error) {
      toast.error("Reconciliation failed");
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Bank Reconciliation"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Bank Reconciliation" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
      userRole={(session?.user as any)?.role ?? "finance"}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={load}
    >
      <div className="space-y-6 max-h-[calc(100vh-120px)] flex flex-col">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">
              Bank Reconciliation
            </h1>
            <p className="text-sm text-muted-foreground">
              Match bank statement lines with your records
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleOpenImport}>
              <Upload className="h-4 w-4 mr-2" /> Import Statement
            </Button>
            <Button
              disabled={!selectedStatement || !selectedJournal}
              onClick={handleReconcile}
              className="bg-primary hover:bg-primary/90 rounded-none font-bold"
            >
              <Check className="h-4 w-4 mr-2" /> Match Selected
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
          {/* Section 1: Bank Statements */}
          <Card className="flex flex-col overflow-hidden bg-background rounded-none border border-border/60">
            <CardHeader className="bg-muted/10 border-b py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <Building className="h-4 w-4 text-primary" /> Bank Statement
                  Lines
                </CardTitle>
                <Badge
                  variant="secondary"
                  className="rounded-none bg-primary/5 text-primary border-primary/20"
                >
                  {statements.length} Open
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto bg-muted/5">
              {loading ? (
                <div className="p-4 space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : statements.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 opacity-40">
                  <Building className="h-12 w-12 mb-4" />
                  <p className="text-sm font-medium">No open statements</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {statements.map((line, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedStatement(line)}
                      className={`p-4 cursor-pointer transition-all ${selectedStatement?._id === line._id ? "bg-white border-l-4 border-primary shadow-sm" : "hover:bg-white/50"}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">
                            {new Date(line.date).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                          <p className="font-bold text-sm leading-tight">
                            {line.payment_ref || "Bank Transfer"}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {line.partnerId?.name || "Unknown Partner"}
                          </p>
                        </div>
                        <p
                          className={`font-black text-lg ${line.amount > 0 ? "text-green-600" : "text-foreground"}`}
                        >
                          {line.amount > 0 ? "+" : ""}
                          <span className="text-xs mr-0.5">₹</span>
                          {line.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Journal Entries */}
          <Card className="flex flex-col overflow-hidden bg-background rounded-none border border-border/60">
            <CardHeader className="bg-muted/10 border-b py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-primary" /> Journal Items
                  (ERP)
                </CardTitle>
                <Badge
                  variant="secondary"
                  className="rounded-none bg-primary/5 text-primary border-primary/20"
                >
                  {journalLines.length} Unreconciled
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto bg-muted/5">
              {loading ? (
                <div className="p-4 space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : journalLines.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 opacity-40">
                  <LinkIcon className="h-12 w-12 mb-4" />
                  <p className="text-sm font-medium">No unreconciled items</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {journalLines.map((line, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedJournal(line)}
                      className={`p-4 cursor-pointer transition-all ${selectedJournal?.journalLineId === line.journalLineId ? "bg-white border-l-4 border-primary shadow-sm" : "hover:bg-white/50"}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">
                            {new Date(line.date).toLocaleDateString()} •{" "}
                            <span className="text-primary">
                              {line.entryName}
                            </span>
                          </p>
                          <p className="font-bold text-sm leading-tight">
                            {line.label || "Journal Entry"}
                          </p>
                          <p className="text-[10px] uppercase font-black text-primary/70 mt-1 tracking-wider bg-primary/5 inline-block px-1">
                            {line.accountId?.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-lg">
                            <span className="text-xs mr-0.5">₹</span>
                            {(line.debit || line.credit).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-right font-black uppercase tracking-tighter text-muted-foreground/60">
                            {line.debit > 0 ? "Debit" : "Credit"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Action Panel */}
        {selectedStatement && selectedJournal && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white border border-primary/30 shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-none p-6 flex items-center justify-between animate-in fade-in slide-in-from-bottom-8 z-50">
            <div className="flex items-center gap-6">
              <div className="text-left">
                <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">
                  Statement Line
                </p>
                <p className="font-black text-xl text-primary">
                  ₹{selectedStatement.amount.toLocaleString()}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                <ArrowRightLeft className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">
                  ERP Record
                </p>
                <p className="font-black text-xl">
                  ₹
                  {(
                    selectedJournal.debit || selectedJournal.credit
                  ).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                className="rounded-none font-bold"
                onClick={() => {
                  setSelectedStatement(null);
                  setSelectedJournal(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReconcile}
                className="px-10 bg-black text-white hover:bg-black/90 rounded-none font-black uppercase tracking-widest text-xs h-11"
              >
                Validate Match
              </Button>
            </div>
          </div>
        )}
      </div>

      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="Import Bank Statement"
        className="max-w-5xl"
        footer={
          <div className="flex justify-end gap-3 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="rounded-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-none font-bold"
            >
              {isSubmitting ? "Importing..." : "Finalize Import"}
            </Button>
          </div>
        }
      >
        {formData && (
          <BankStatementImportPopup
            formData={formData}
            setFormData={setFormData}
          />
        )}
      </ModularModal>
    </DashboardLayout>
  );
}
