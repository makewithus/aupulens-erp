"use client";

import { AttendanceOverview } from "./AttendanceOverview";
import { RecentHires } from "./RecentHires";

interface Hire {
  firstName: string;
  lastName: string;
  employeeCode: string;
  designation: string;
  dateOfJoining: string;
  lifecycleStatus: string;
}

interface WorkforceOverviewProps {
  loading: boolean;
  attendance: Record<string, number>;
  hires: Hire[];
}

export function WorkforceOverview({
  loading,
  attendance,
  hires,
}: WorkforceOverviewProps) {
  return (
    <section className="grid grid-cols-1 gap-20 xl:grid-cols-2">

      <AttendanceOverview
        loading={loading}
        attendance={attendance}
      />

      <RecentHires
        loading={loading}
        hires={hires}
      />

    </section>
  );
}