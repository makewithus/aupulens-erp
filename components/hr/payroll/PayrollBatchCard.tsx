"use client";

import { Card, CardContent } from "@/components/ui/card";
import { PayrollActions } from "./PayrollActions";
import { PayrollWorkflow } from "./PayrollWorkflow";

interface PayrollRun {
  _id: string;
  payrollCode: string;
  payrollPeriod: {
    month: number;
    year: number;
  };
  status: string;
  lineItems: any[];
  totals: {
    totalGross: number;
    totalNet: number;
    employeeCount: number;
  };
}

interface PayrollBatchCardProps {
  payroll: PayrollRun;
  currentStep: number;
  totalSteps: number;
  statusLabel: string;
  nextAction?: string;
  canContinue: boolean;
  canDelete: boolean;
  onView: () => void;
  onContinue: () => void;
  onDelete: () => void;
}

const formatMoney = (n: number) =>
  "₹" +
  Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const monthName = (m: number) =>
  new Date(2000, m - 1).toLocaleString("default", {
    month: "long",
  });

const workflowSteps = [
  { key: "draft", label: "Draft" },
  { key: "attendance_locked", label: "Lock" },
  { key: "computed", label: "Compute" },
  { key: "reviewed", label: "Review" },
  { key: "approved", label: "Approve" },
  { key: "disbursed", label: "Pay" },
  { key: "posted_to_gl", label: "GL" },
];

export function PayrollBatchCard({
  payroll,
  currentStep,
  statusLabel,
  nextAction,
  canContinue,
  canDelete,
  onView,
  onContinue,
  onDelete,
}: PayrollBatchCardProps) {
  return (
    <Card className="group overflow-hidden border-border/40 shadow-none transition-colors hover:bg-muted/20">
      <CardContent className="p-6 space-y-6">

        {/* Header */}

        <div className="flex items-start justify-between gap-8">

          <div>

            <h2 className="text-[24px] font-medium tracking-[-0.04em]">
            {monthName(payroll.payrollPeriod.month)} {payroll.payrollPeriod.year}
            </h2>

            <p className="mt-1 font-mono text-[11px] text-muted-foreground/45">
            {payroll.payrollCode}
            </p>

          </div>

          <div className="text-right">
            <p className="mt-1 text-sm font-medium uppercase">
              {statusLabel}
            </p>

          </div>

        </div>

        {/* Metrics */}
{/* 
        <div className="grid grid-cols-3 gap-10">

          <div>

            <p className="font-mono text-[10px] text-muted-foreground/45">
              Employees
            </p>

            <p className="mt-2 text-[26px] font-medium tracking-tight">
              {payroll.totals.employeeCount ||
                payroll.lineItems.length}
            </p>

          </div>

          <div>

            <p className="font-mono text-[10px] text-muted-foreground/45">
              Gross Payroll
            </p>

            <p className="mt-2 text-[26px] font-medium tracking-tight">
              {formatMoney(payroll.totals.totalGross)}
            </p>

          </div>

          <div>

            <p className="font-mono text-[10px] text-muted-foreground/45">
              Net Payroll
            </p>

            <p className="mt-2 text-[26px] font-medium tracking-tight">
              {formatMoney(payroll.totals.totalNet)}
            </p>

          </div>

        </div> */}

        {/* Progress */}

        

        {/* Actions */}

        <PayrollActions
          showContinue={canContinue}
          continueLabel={nextAction}
          canDelete={canDelete}
          onView={onView}
          onContinue={onContinue}
          onDelete={onDelete}
        />

        <PayrollWorkflow
    currentStep={currentStep}
    steps={workflowSteps}
/>

      </CardContent>
    </Card>
  );
}