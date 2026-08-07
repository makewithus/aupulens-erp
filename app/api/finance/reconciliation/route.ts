import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BankReconciliation from "@/models/BankReconciliation";
import { logActivity } from "@/lib/logger";

// Define transaction and reconciliation interfaces
interface Transaction {
  status: "matched" | "unmatched" | string;
  amount?: number;
  date?: string;
  [key: string]: unknown;
}

interface Reconciliation {
  _id: string;
  bankStatementDate: Date;
  bankBalance: number;
  ledgerBalance: number;
  reconciled: boolean;
  notes?: string;
  createdBy?: { _id: string; name?: string; email?: string } | string;
  reconciledBy?: { _id: string; name?: string; email?: string } | string;
  transactions?: Transaction[];
  createdAt?: Date;
}

export async function GET() {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "finance")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();

    // Explicitly cast the DB result to your defined type
    const reconciliations = (await BankReconciliation.find({
          tenantId,
        })
          .sort({ bankStatementDate: -1 })
          .populate("createdBy reconciledBy", "name email").lean()) as unknown as Reconciliation[];

    // Safely transform data for frontend
    const transformedReconciliations = reconciliations.map((recon) => {
      const difference = recon.bankBalance - recon.ledgerBalance;

      const matchedTransactions =
        recon.transactions?.filter((t: Transaction) => t.status === "matched")
          .length ?? 0;

      const unmatchedTransactions =
        recon.transactions?.filter((t: Transaction) => t.status === "unmatched")
          .length ?? 0;

      let status: "pending" | "reconciled" | "discrepancy" = "pending";
      if (recon.reconciled) {
        status = "reconciled";
      } else if (Math.abs(difference) > 0) {
        status = "discrepancy";
      }

      return {
        _id: recon._id,
        accountName:
          recon.notes?.split("Account: ")[1]?.split(" (")[0] ||
          "Unknown Account",
        accountNumber: recon.notes?.split("(")[1]?.split(")")[0] || "N/A",
        statementDate: recon.bankStatementDate,
        statementBalance: recon.bankBalance,
        bookBalance: recon.ledgerBalance,
        difference,
        status,
        matchedTransactions,
        unmatchedTransactions,
        createdAt: recon.createdAt,
      };
    });

    return NextResponse.json({ reconciliations: transformedReconciliations });
  } catch (error) {
    console.error("Error fetching reconciliations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "finance")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdCheck = requireTenantId(session);
    if (tenantIdCheck) return tenantIdCheck;
    const tenantId = (session.user as any).tenantId;

    await connectDB();

    const body = await req.json();
    const {
      bankStatementDate,
      bankBalance,
      ledgerBalance,
      transactions,
      notes,
    } = body;

    if (
      !bankStatementDate ||
      bankBalance === undefined ||
      ledgerBalance === undefined ||
      !transactions
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const reconciliation = await BankReconciliation.create({
      bankStatementDate: new Date(bankStatementDate),
      bankBalance,
      ledgerBalance,
      transactions,
      reconciled: false,
      notes,
      createdBy: session.user.id as any,
      tenantId,
    });

    await logActivity({
      activity: "Created bank reconciliation",
      details: `Date: ${bankStatementDate}, Difference: ${Math.abs(
        bankBalance - ledgerBalance,
      )}`,
      req,
    });

    return NextResponse.json({ reconciliation }, { status: 201 });
  } catch (error) {
    console.error("Error creating reconciliation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
