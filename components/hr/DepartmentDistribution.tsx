"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface Department {
  departmentName: string;
  count: number;
}

interface DepartmentDistributionProps {
  departments: Department[];
  loading: boolean;
}

export function DepartmentDistribution({
  departments,
  loading,
}: DepartmentDistributionProps) {
  const max =
    Math.max(...departments.map((d) => d.count), 1);

  if (loading) {
    return (
      <section className="space-y-8">
        <div>
          <h2 className="text-4xl font-black tracking-tighter">
            Department Distribution
          </h2>
        </div>

        <div className="space-y-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (departments.length === 0) {
    return (
      <section className="space-y-8">
        <div>
          <h2 className="text-4xl font-black tracking-tighter">
            Department Distribution
          </h2>
        </div>

        <div className="py-20 text-center text-muted-foreground">
          No department data available.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-10">

      {/* Heading */}

      <div>
        <h2 className="text-4xl font-black tracking-tighter">
          Department Distribution
        </h2>
      </div>

      {/* Department List */}

      <div className="space-y-8">

        {departments.map((dept) => {

          const width =
            (dept.count / max) * 100;

          return (
            <div key={dept.departmentName}>

              <div className="mb-4 flex items-center justify-between">

                <h3 className="text-lg font-medium tracking-tight">
                  {dept.departmentName}
                </h3>

                <span className="font-mono text-sm text-muted-foreground">
                  {dept.count}
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