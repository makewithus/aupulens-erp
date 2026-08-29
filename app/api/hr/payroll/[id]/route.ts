import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Payroll from "@/models/hr/Payroll";
import Employee from "@/models/hr/Employee";
import Attendance from "@/models/hr/Attendance";
import JournalEntry from "@/models/finance/JournalEntry";
import Account from "@/models/finance/Account";
import { VOUCHER_TYPE, DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { createPostedJournalEntry } from "@/lib/accounting/posting";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const payroll = await Payroll.findOne({ _id: id, tenantId })
      .populate("departmentId", "name code")
      .populate("approvedBy", "name")
      .populate("computedBy", "name")
      .populate("chatter.authorId", "name")
      .lean();

    if (!payroll) {
      return NextResponse.json(
        { error: "Payroll not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ payroll });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenantIdCheck = requireTenantId(session);
    if (tenantIdCheck) return tenantIdCheck;
    const tenantId = (session.user as any).tenantId;
    const body = await req.json();
    await connectDB();

    const payroll = await Payroll.findOne({ _id: id, tenantId });
    if (!payroll) {
      return NextResponse.json(
        { error: "Payroll not found" },
        { status: 404 },
      );
    }

    const validTransitions: Record<string, string[]> = {
      draft: ["attendance_locked", "cancelled"],
      attendance_locked: ["computed", "cancelled"],
      computed: ["reviewed", "cancelled"],
      reviewed: ["approved", "rejected"],
      approved: ["disbursed"],
      disbursed: ["posted_to_gl"],
      posted_to_gl: [],
      rejected: ["draft"],
      cancelled: [],
    };

    // Handle status transitions
    if (body.status && body.status !== payroll.status) {
      const allowed = validTransitions[payroll.status] || [];
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          {
            error: `Cannot transition from ${payroll.status} to ${body.status}`,
          },
          { status: 400 },
        );
      }

      // ── LOCK ATTENDANCE ──
      if (body.status === "attendance_locked") {
        payroll.attendanceLockedAt = new Date();
        payroll.attendanceLockedBy = session.user.id as any;

        // Lock attendance records for the payroll period
        await Attendance.updateMany(
          {
            tenantId,
            date: {
              $gte: payroll.payrollPeriod.startDate,
              $lte: payroll.payrollPeriod.endDate,
            },
            isLocked: false,
          },
          {
            $set: {
              isLocked: true,
              lockedBy: session.user.id,
              lockedAt: new Date(),
            },
          },
        );
      }

      // ── COMPUTE PAYROLL ──
      if (body.status === "computed") {
        const employeeQuery: any = {
          tenantId,
          lifecycleStatus: "active",
        };
        if (payroll.departmentId) {
          employeeQuery.departmentId = payroll.departmentId;
        }

        const employees = await Employee.find(employeeQuery).lean();
        const lineItems: any[] = [];
        let totalGross = 0;
        let totalDeductions = 0;
        let totalNet = 0;
        let totalOvertime = 0;
        let totalLOP = 0;

        // Batch-fetch all attendance records for the period in one query
        const empIds = employees.map((e) => e._id);
        const allAttendance = await Attendance.find({
          tenantId,
          employeeId: { $in: empIds },
          date: {
            $gte: payroll.payrollPeriod.startDate,
            $lte: payroll.payrollPeriod.endDate,
          },
        }).lean();

        // Group by employeeId string for O(1) lookup
        const attendanceByEmp = new Map<string, typeof allAttendance>();
        for (const rec of allAttendance) {
          const key = String(rec.employeeId);
          if (!attendanceByEmp.has(key)) attendanceByEmp.set(key, []);
          attendanceByEmp.get(key)!.push(rec);
        }

        for (const emp of employees) {
          const attendance = attendanceByEmp.get(String(emp._id)) ?? [];

          const totalWorkingDays = 26; // standard working days
          const daysPresent = attendance.filter(
            (a) =>
              a.status === "present" ||
              a.status === "half-day" ||
              a.status === "on-leave",
          ).length;
          const halfDays = attendance.filter(
            (a) => a.status === "half-day",
          ).length;
          const daysWorked = daysPresent - halfDays * 0.5;
          const daysAbsent = totalWorkingDays - daysWorked;
          const overtime = attendance.reduce(
            (sum, a) => sum + (a.overtime || 0),
            0,
          );

          const sal = emp.salary || {
            basic: 0,
            hra: 0,
            da: 0,
            specialAllowance: 0,
            grossSalary: 0,
            deductions: {
              pf: 0,
              esi: 0,
              professionalTax: 0,
              tds: 0,
              otherDeductions: 0,
            },
            netSalary: 0,
          };

          // Pro-rate all salary components by days-worked ratio
          // LOP is informational (the un-earned share), not double-deducted
          const ratio = totalWorkingDays > 0 ? daysWorked / totalWorkingDays : 0;
          const basic = Math.round((sal.basic || 0) * ratio);
          const hra = Math.round((sal.hra || 0) * ratio);
          const da = Math.round((sal.da || 0) * ratio);
          const specialAllowance = Math.round((sal.specialAllowance || 0) * ratio);
          const fullGross = (sal.basic || 0) + (sal.hra || 0) + (sal.da || 0) + (sal.specialAllowance || 0);
          const grossSalary = basic + hra + da + specialAllowance;
          const lossOfPay = fullGross - grossSalary; // informational

          const deductions = (sal.deductions as any) || {};
          const pf = Math.round((deductions.pf || 0) * ratio);
          const esi = Math.round((deductions.esi || 0) * ratio);
          const professionalTax = deductions.professionalTax || 0; // flat, not pro-rated
          const tds = Math.round((deductions.tds || 0) * ratio);
          const otherDeductions = Math.round((deductions.otherDeductions || 0) * ratio);
          const totalDed = pf + esi + professionalTax + tds + otherDeductions;

          const overtimeRate = (sal.basic || 0) / totalWorkingDays / 8;
          const overtimeAmount = Math.round(overtime * overtimeRate * 1.5);
          const netSalary = grossSalary - totalDed + overtimeAmount;

          lineItems.push({
            employeeId: emp._id,
            employeeCode: emp.employeeCode || "",
            employeeName: [emp.firstName, emp.lastName].filter(Boolean).join(" ") || emp.employeeCode || String(emp._id),
            basic,
            hra,
            da,
            specialAllowance,
            grossSalary,
            deductions: {
              pf,
              esi,
              professionalTax,
              tds,
              otherDeductions,
              totalDeductions: totalDed,
            },
            netSalary,
            daysWorked,
            daysAbsent,
            overtime,
            overtimeAmount,
            lossOfPay,
          });

          totalGross += grossSalary;
          totalDeductions += totalDed;
          totalNet += netSalary;
          totalOvertime += overtimeAmount;
          totalLOP += lossOfPay;
        }

        payroll.set('lineItems', lineItems);
        payroll.markModified('lineItems');
        payroll.totals = {
          totalGross,
          totalDeductions,
          totalNet,
          totalOvertime,
          totalLOP,
          currency: "INR",
        };
        payroll.computedAt = new Date();
        payroll.computedBy = session.user.id as any;
      }

      // ── REVIEWED ──
      if (body.status === "reviewed") {
        payroll.reviewedAt = new Date();
        payroll.reviewedBy = session.user.id as any;
      }

      // ── APPROVED ──
      if (body.status === "approved") {
        payroll.approvedAt = new Date();
        payroll.approvedBy = session.user.id as any;

        // ── ACCOUNTING: Dr Salary Expense, Cr Salary Payable ──
        try {
          let salaryExpenseAccount = await Account.findOne({
            tenantId,
            name: { $regex: /salary.*expense/i },
          });
          let salaryPayableAccount = await Account.findOne({
            tenantId,
            name: { $regex: /salary.*payable/i },
          });

          if (!salaryExpenseAccount) {
            salaryExpenseAccount = await Account.create({
              tenantId,
              code: "5100",
              name: "Salary Expense",
              account_type: "expense",
              internal_group: "expense",
              reconcile: false,
              tax_ids: [],
              createdBy: session.user.id,
            });
          }
          if (!salaryPayableAccount) {
            salaryPayableAccount = await Account.create({
              tenantId,
              code: "2200",
              name: "Salary Payable",
              account_type: "liability_current",
              internal_group: "liability",
              reconcile: true,
              tax_ids: [],
              createdBy: session.user.id,
            });
          }

          const journalEntry = await createPostedJournalEntry({
            tenantId,
            header: {
              name: `JE-PAYROLL-${payroll.payrollCode}`,
              date: new Date(),
              ref: payroll.payrollCode,
              journalType: "general",
            },
            voucherType: VOUCHER_TYPE.JOURNAL,
            lineIds: [
              {
                accountId: salaryExpenseAccount._id,
                label: `Salary Expense - ${payroll.payrollCode}`,
                debit: payroll.totals.totalGross,
                credit: 0,
              },
              {
                accountId: salaryPayableAccount._id,
                label: `Salary Payable - ${payroll.payrollCode}`,
                debit: 0,
                credit: payroll.totals.totalGross,
              },
            ],
            totals: {
              amountUntaxed: payroll.totals.totalGross,
              amountTax: 0,
              amountTotal: payroll.totals.totalGross,
            },
            createdBy: session.user.id,
          });

          payroll.salaryExpenseJournalId = journalEntry._id as any;
        } catch (err: any) {
          console.error("Payroll JE creation error:", err);
          return NextResponse.json(
            { error: `Payroll accounting failed: ${err.message}` },
            { status: 400 },
          );
        }
      }

      // ── DISBURSED ──
      if (body.status === "disbursed") {
        payroll.disbursedAt = new Date();
        payroll.disbursedBy = session.user.id as any;
        payroll.disbursementRef = body.disbursementRef || "";

        // ── ACCOUNTING: Dr Salary Payable, Cr Bank ──
        try {
          let salaryPayableAccount = await Account.findOne({
            tenantId,
            name: { $regex: /salary.*payable/i },
          });
          let bankAccount = await Account.findOne({
            tenantId,
            account_type: "asset_cash",
          });

          if (!salaryPayableAccount) {
            salaryPayableAccount = await Account.create({
              tenantId,
              code: "2200",
              name: "Salary Payable",
              account_type: "liability_current",
              internal_group: "liability",
              reconcile: true,
              tax_ids: [],
              createdBy: session.user.id,
            });
          }
          if (!bankAccount) {
            bankAccount = await Account.create({
              tenantId,
              code: "1010",
              name: "Bank Account",
              account_type: "asset_cash",
              internal_group: "asset",
              reconcile: true,
              tax_ids: [],
              createdBy: session.user.id,
            });
          }

          const disbursementJE = await createPostedJournalEntry({
            tenantId,
            header: {
              name: `JE-DISB-${payroll.payrollCode}`,
              date: new Date(),
              ref: payroll.payrollCode,
              journalType: "bank",
            },
            voucherType: VOUCHER_TYPE.PAYMENT,
            lineIds: [
              {
                accountId: salaryPayableAccount._id,
                label: `Salary Payable Settlement - ${payroll.payrollCode}`,
                debit: payroll.totals.totalNet,
                credit: 0,
              },
              {
                accountId: bankAccount._id,
                label: `Bank Payment - ${payroll.payrollCode}`,
                debit: 0,
                credit: payroll.totals.totalNet,
              },
            ],
            totals: {
              amountUntaxed: payroll.totals.totalNet,
              amountTax: 0,
              amountTotal: payroll.totals.totalNet,
            },
            createdBy: session.user.id,
          });

          payroll.disbursementJournalId = disbursementJE._id as any;
        } catch (err: any) {
          console.error("Disbursement JE creation error:", err);
          return NextResponse.json(
            { error: `Payroll disbursement accounting failed: ${err.message}` },
            { status: 400 },
          );
        }
      }

      // ── POSTED TO GL ──
      if (body.status === "posted_to_gl") {
        // Mark the journal entries as posted / update ledger timestamps
        if (payroll.salaryExpenseJournalId) {
          await JournalEntry.findOneAndUpdate(
            { _id: payroll.salaryExpenseJournalId, tenantId },
            {
              $set: {
                status: DOCUMENT_STATUS.POSTED,
                ledgerUpdatedAt: new Date(),
              },
            },
          );
        }
        if (payroll.disbursementJournalId) {
          await JournalEntry.findOneAndUpdate(
            { _id: payroll.disbursementJournalId, tenantId },
            {
              $set: {
                status: DOCUMENT_STATUS.POSTED,
                ledgerUpdatedAt: new Date(),
              },
            },
          );
        }
      }

      payroll.status = body.status;
    }

    // Handle notes update
    if (body.notes !== undefined) {
      payroll.notes = body.notes;
    }

    await payroll.save();

    return NextResponse.json({ success: true, payroll });
  } catch (error: any) {
    console.error("Payroll Update Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenantIdCheck = requireTenantId(session);
    if (tenantIdCheck) return tenantIdCheck;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const payroll = await Payroll.findOne({ _id: id, tenantId });
    if (!payroll) {
      return NextResponse.json(
        { error: "Payroll not found" },
        { status: 404 },
      );
    }

    if (
      payroll.status !== "draft" &&
      payroll.status !== "cancelled" &&
      payroll.status !== "rejected"
    ) {
      return NextResponse.json(
        { error: "Only draft, cancelled, or rejected payrolls can be deleted" },
        { status: 400 },
      );
    }

    await Payroll.findOneAndDelete({ _id: id, tenantId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
