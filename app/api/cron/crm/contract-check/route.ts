import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CrmContract from "@/models/crm/Contract";
import CrmTask from "@/models/crm/Task";
import CrmActivity from "@/models/crm/Activity";

export async function GET(req: NextRequest) {
  // Cron protection via Vercel or internal secret
  await dbConnect();

  const now = new Date();
  
  const intervals = [90, 60, 30, 7];
  let tasksCreated = 0;

  for (const days of intervals) {
    const targetStart = new Date(now);
    targetStart.setDate(targetStart.getDate() + days);
    targetStart.setHours(0,0,0,0);
    
    const targetEnd = new Date(targetStart);
    targetEnd.setHours(23,59,59,999);

    const expiringContracts = await CrmContract.find({
          end_date: { $gte: targetStart, $lte: targetEnd },
          status: { $in: ['Active', 'Expiring Soon'] },
          renewal_status: { $in: ['Not Started'] }
        }).lean();

    for (const contract of expiringContracts) {
      if (days <= 30 && contract.status === 'Active') {
        contract.status = 'Expiring Soon';
        await contract.save();
      }

      await CrmTask.create({
        tenantId: contract.tenantId,
        title: `Contract Expiring in ${days} Days: ${contract.contract_number}`,
        category: 'Renew Contract',
        due_date: targetStart,
        assigned_to_id: contract.owner_id,
        linked_account_id: contract.account_id,
        linked_contract_id: contract._id,
        status: 'Pending',
        priority: days <= 30 ? 'High' : 'Medium',
        createdBy: contract.createdBy
      });

      await CrmActivity.create({
        tenantId: contract.tenantId,
        type: 'Note',
        subject: `Automated Reminder: ${days} days until contract expiry.`,
        linked_account_id: contract.account_id,
        linked_contract_id: contract._id,
        performed_by_id: contract.owner_id,
        createdBy: contract.createdBy
      });

      tasksCreated++;
    }
  }

  return NextResponse.json({ success: true, tasksCreated });
}
