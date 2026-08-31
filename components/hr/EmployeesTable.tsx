"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users as UsersIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  dateFrom: string;
  setDateFrom: (value: string) => void;

  dateTo: string;
  setDateTo: (value: string) => void;

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

  dateFrom,
  setDateFrom,

  dateTo,
  setDateTo,

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
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
            />
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        <Table>
          <TableHeader className="border-border/40">
            <TableRow>
              <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                Employee
              </TableHead>

              <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                Contact
              </TableHead>

              {/* <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                Code
              </TableHead> */}

              <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                Department
              </TableHead>

              {/* <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                Lifecycle
              </TableHead> */}

              <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                User Account
              </TableHead>

              {/* <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                Salary
              </TableHead> */}

              <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-border/30">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="px-8 py-7">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-36" />
                      <Skeleton className="h-3 w-24 opacity-55" />
                    </div>
                  </TableCell>

                  <TableCell className="px-8 py-7">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </TableCell>

                  {/* <TableCell className="px-8 py-7">
                    <Skeleton className="h-4 w-20" />
                  </TableCell> */}

                  <TableCell className="px-8 py-7">
                    <Skeleton className="h-4 w-28" />
                  </TableCell>

                  {/* <TableCell className="px-8 py-7">
                    <Skeleton className="h-4 w-20" />
                  </TableCell> */}

                  <TableCell className="px-8 py-7">
                    <Skeleton className="h-4 w-24" />
                  </TableCell>

                  {/* <TableCell className="px-8 py-7">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="mt-2 h-3 w-20" />
                  </TableCell> */}

                  <TableCell className="px-8 py-7">
                    <div className="flex justify-end gap-1">
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-24 text-center">
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
                </TableCell>
              </TableRow>
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
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}