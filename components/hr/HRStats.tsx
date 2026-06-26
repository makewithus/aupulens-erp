"use client";

import { StatCard } from "../admin/StatCard";

interface HRStatsProps {
  summary: any;
  formatCurrency: (value: number) => string;
}

export function HRStats({
  summary,
  formatCurrency,
}: HRStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-5">

      <StatCard
        title="Total Employees"
        value={summary?.stats.totalEmployees ?? 0}
        // subtitle="Across the organisation"
      />

      <StatCard
        title="Active Employees"
        value={summary?.stats.activeEmployees ?? 0}
        // subtitle="Currently working"
      />

      <StatCard
        title="Onboarding"
        value={summary?.stats.onboardingEmployees ?? 0}
        // subtitle="Joining process"
      />

      <StatCard
        title="Pending Leaves"
        value={summary?.stats.pendingLeaves ?? 0}
        // subtitle="Awaiting approval"
      />

      {/* <StatCard
        title="Departments"
        value={summary?.stats.totalDepartments ?? 0}
        subtitle="Active departments"
      /> */}

      <StatCard
        title="Monthly Payroll"
        value={formatCurrency(summary?.payrollSummary.totalNet ?? 0)}
        // subtitle="Net payroll"
      />

    </div>
  );
}