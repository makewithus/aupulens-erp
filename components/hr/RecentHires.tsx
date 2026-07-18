"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface Hire {
  firstName: string;
  lastName: string;
  employeeCode: string;
  designation: string;
  dateOfJoining: string;
  lifecycleStatus: string;
}

interface RecentHiresProps {
  loading: boolean;
  hires: Hire[];
}

export function RecentHires({
  loading,
  hires,
}: RecentHiresProps) {
  const router = useRouter();

  if (loading) {
    return (
      <section className="space-y-8">

        <div className="flex items-end justify-between">

          <div>
            <h2 className="text-4xl font-black tracking-tighter">
              Recent Hires
            </h2>
          </div>

          <Skeleton className="h-8 w-20" />

        </div>

        <div className="space-y-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-14 w-full"
            />
          ))}
        </div>

      </section>
    );
  }

  if (!hires.length) {
    return (
      <section className="space-y-8">

        <div className="flex items-end justify-between">

          <div>
            <h2 className="text-4xl font-black tracking-tighter">
              Recent Hires
            </h2>

          </div>

        </div>

        <div className="py-20 text-center text-muted-foreground">
          No recent hires.
        </div>

      </section>
    );
  }

  return (
    <section className="space-y-10">

      {/* Heading */}

      <div className="flex items-end justify-between">

        <div>

          <h2 className="text-4xl font-black tracking-tighter">
            Recent Hires
          </h2>

        </div>

        <Button
          variant="ghost"
          onClick={() => router.push("/hr/employees")}
          className="gap-2 rounded-none"
        >
          View all
          <ArrowRight className="h-4 w-4" />
        </Button>

      </div>

      {/* List */}

      <div className="space-y-8">

        {hires.map((hire) => {

          const joined = new Date(hire.dateOfJoining);

          const daysAgo = Math.max(
            0,
            Math.floor(
              (Date.now() - joined.getTime()) /
                (1000 * 60 * 60 * 24)
            )
          );

          return (

            <div
              key={hire.employeeCode}
              className="flex items-center justify-between border-b border-border/30 pb-6 last:border-0"
            >

              <div>

                <h3 className="text-xl font-medium tracking-tight">
                  {hire.firstName} {hire.lastName}
                </h3>

                <p className="mt-1 text-muted-foreground">
                  {hire.designation || "Employee"}
                </p>

                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/40">
                  {hire.employeeCode}
                </p>

              </div>

              <div className="text-right">

                <p className="text-lg font-medium">
                  {daysAgo === 0
                    ? "Today"
                    : `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`}
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Joined
                </p>

              </div>

            </div>

          );
        })}

      </div>

    </section>
  );
}