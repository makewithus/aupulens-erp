"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users as UsersIcon } from "lucide-react";

import { EmployeeRow } from "./EmployeeRow";
import { EmployeeToolbar } from "./EmployeesToolbar";

interface Employee {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  designation?: string;
  departmentId?: {
    _id: string;
    name: string;
    code: string;
  };
  lifecycleStatus: string;
  salary?: {
    grossSalary: number;
    netSalary: number;
    currency: string;
  };
  userId?: {
    _id: string;
    name: string;
    email: string;
    role: string;
    status: string;
  } | null;
}

interface EmployeeTableProps {
  employees: Employee[];
  isLoading: boolean;
  hasFilters: boolean;

  searchQuery: string;
  setSearchQuery: (value: string) => void;

  lifecycleFilter: string;
  setLifecycleFilter: (value: string) => void;

  accountFilter: string;
  setAccountFilter: (value: string) => void;

  lifecycleColors: Record<string, string>;
  getRoleBadgeColor: (role: string) => string;

  onView: (employee: Employee) => void;
  onEdit: (employee: Employee) => void;
  onDelete: (employeeId: string) => void;
}

export function EmployeeTable({
  employees,
  isLoading,
  hasFilters,

  searchQuery,
  setSearchQuery,

  lifecycleFilter,
  setLifecycleFilter,

  accountFilter,
  setAccountFilter,

  lifecycleColors,
  getRoleBadgeColor,

  onView,
  onEdit,
  onDelete,
}: EmployeeTableProps) {
  return (
    <Card className="overflow-hidden border-border/40 shadow-none bg-background">
      {/* Header */}
      <div className="border-b border-border/20 px-8 py-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="shrink-0">
            <h2 className="text-[30px] font-medium tracking-[-0.05em]">
              All Employees
            </h2>

            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
              {employees.length}{" "}
              {employees.length === 1 ? "Employee" : "Employees"}
            </p>
          </div>

          <div className="w-full max-w-3xl">
            <EmployeeToolbar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              lifecycleFilter={lifecycleFilter}
              setLifecycleFilter={setLifecycleFilter}
              accountFilter={accountFilter}
              setAccountFilter={setAccountFilter}
            />
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border/40">
              <tr className="text-left">
                <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Employee
                </th>

                <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Contact
                </th>

                {/* <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Code
                </th> */}

                <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Department
                </th>

                {/* <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Lifecycle
                </th> */}

                <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  User Account
                </th>

                {/* <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Salary
                </th> */}

                <th className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-8 py-7">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-36" />
                        <Skeleton className="h-3 w-24 opacity-55" />
                      </div>
                    </td>

                    <td className="px-8 py-7">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    </td>

                    {/* <td className="px-8 py-7">
                      <Skeleton className="h-4 w-20" />
                    </td> */}

                    <td className="px-8 py-7">
                      <Skeleton className="h-4 w-28" />
                    </td>

                    {/* <td className="px-8 py-7">
                      <Skeleton className="h-4 w-20" />
                    </td> */}

                    <td className="px-8 py-7">
                      <Skeleton className="h-4 w-24" />
                    </td>

                    {/* <td className="px-8 py-7">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="mt-2 h-3 w-20" />
                    </td> */}

                    <td className="px-8 py-7">
                      <div className="flex justify-end gap-1">
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-24 text-center">
                    <UsersIcon className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />

                    <h3 className="text-lg font-medium">
                      {hasFilters
                        ? "No employees match your filters"
                        : "No employees found"}
                    </h3>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {hasFilters
                        ? "Try adjusting your search or filters."
                        : "Create your first employee to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <EmployeeRow
                    key={employee._id}
                    employee={employee}
                    lifecycleColors={lifecycleColors}
                    getRoleBadgeColor={getRoleBadgeColor}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}