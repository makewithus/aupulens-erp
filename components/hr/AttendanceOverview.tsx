"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface AttendanceOverviewProps {
  loading: boolean;
  attendance: Record<string, number>;
}

export function AttendanceOverview({
  loading,
  attendance,
}: AttendanceOverviewProps) {
  if (loading) {
    return (
      <section className="space-y-8">

        <div>
          <h2 className="text-4xl font-black tracking-tighter">
            Attendance
          </h2>

        </div>

        <div className="space-y-7">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>

      </section>
    );
  }

  const entries = Object.entries(attendance);

  if (!entries.length) {
    return (
      <section className="space-y-8">

        <div>
          <h2 className="text-4xl font-black tracking-tighter">
            Attendance
          </h2>
        </div>

        <div className="py-20 text-center text-muted-foreground">
          No attendance has been recorded today.
        </div>

      </section>
    );
  }

  const max = Math.max(...entries.map(([, count]) => count), 1);

  return (
    <section className="space-y-10">

      {/* Heading */}

      <div>
        <h2 className="text-4xl font-black tracking-tighter">
          Attendance
        </h2>
      </div>

      {/* Attendance List */}

      <div className="space-y-8">

        {entries.map(([status, count]) => {

          const width = (count / max) * 100;

          return (
            <div key={status}>

              <div className="mb-4 flex items-center justify-between">

                <h3 className="text-lg font-medium capitalize tracking-tight">
                  {status.replace("-", " ")}
                </h3>

                <span className="font-mono text-sm text-muted-foreground">
                  {count}
                </span>

              </div>

              <div className="h-[2px] overflow-hidden bg-border/30">

                <div
                  className="h-full bg-foreground transition-all duration-700"
                  style={{
                    width: `${width}%`,
                  }}
                />

              </div>

            </div>
          );
        })}

      </div>

    </section>
  );
}