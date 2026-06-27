"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Phone,
  Building2,
  Link2,
  UserX,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";

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

interface EmployeeRowProps {
  employee: Employee;
  lifecycleColors: Record<string, string>;
  getRoleBadgeColor: (role: string) => string;
  onView: (employee: Employee) => void;
  onEdit: (employee: Employee) => void;
  onDelete: (employeeId: string) => void;
}

export function EmployeeRow({
  employee,
  lifecycleColors,
  getRoleBadgeColor,
  onView,
  onEdit,
  onDelete,
}: EmployeeRowProps) {
  return (
    <tr className="group transition-colors duration-300 hover:bg-white/[0.015]">
      {/* EMPLOYEE */}
      <td className="px-8 py-7">
        <div className="space-y-1">
            <h3 className="text-[18px] font-medium tracking-[-0.03em]">
            {employee.firstName} {employee.lastName}
            </h3>

            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground/55">
            {employee.employeeCode}
            {employee.designation && (
                <>
                {" "}
                • {employee.designation}
                </>
            )}
            </p>
        </div>
</td>

      {/* CONTACT */}
      <td className="px-8 py-7">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span>{employee.email}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span>{employee.phone}</span>
          </div>
        </div>
      </td>

      {/* CODE */}
      {/* <td className="px-8 py-7">
        <span className="font-mono text-sm text-muted-foreground">
          {employee.employeeCode}
        </span>
      </td> */}

      {/* DEPARTMENT */}
      <td className="px-8 py-7">
        {employee.departmentId ? (
          <div className="flex items-center gap-2 text-sm">
            <span>{employee.departmentId.name}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            Unassigned
          </span>
        )}
      </td>

      {/* LIFECYCLE
      <td className="px-8 py-7">
        <Badge
          className={`
            rounded-none
            border-0
            bg-transparent
            px-0
            font-mono
            text-[12px]
            uppercase
            tracking-[0.12em]
            hover:bg-transparent
            shadow-none
            ${
              lifecycleColors[employee.lifecycleStatus] ??
              "text-muted-foreground"
            }
          `}
        >
          {employee.lifecycleStatus.replace("_", " ")}
        </Badge>
      </td> */}

      {/* USER ACCOUNT */}
      <td className="px-8 py-7">
        {employee.userId ? (
          <div className="space-y-1">
            <Badge
              className={`
                rounded-none
                border-0
                bg-transparent
                px-0
                font-mono
                text-[12px]
                uppercase
                tracking-[0.12em]
                hover:bg-transparent
                shadow-none
                ${getRoleBadgeColor(employee.userId.role)}
              `}
            >
              <Link2 className="mr-1 h-3 w-3" />
              {employee.userId.role}
            </Badge>

            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground/55">
              {employee.userId.status}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserX className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span>No Account</span>
          </div>
        )}
      </td>

      {/* SALARY
      <td className="px-8 py-7">
        <div className="space-y-1">
          <p className="text-sm">
            ₹{(employee.salary?.grossSalary ?? 0).toLocaleString()}
          </p>

          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground/55">
            Net ₹{(employee.salary?.netSalary ?? 0).toLocaleString()}
          </p>
        </div>
      </td> */}

      {/* ACTIONS */}
      <td className="px-8 py-7">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onView(employee)}
            className="h-8 w-8 rounded-none hover:bg-white/5"
          >
            <Eye className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(employee)}
            className="h-8 w-8 rounded-none hover:bg-white/5"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(employee._id)}
            className="h-8 w-8 rounded-none text-[#F56868] hover:bg-white/5"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}