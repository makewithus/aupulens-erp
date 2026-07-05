import { addDays, startOfDay, endOfDay, subDays } from "date-fns";
import Reminder from "@/models/Reminder";
import { SalesInvoice } from "@/models/SalesInvoice";
import Bill from "@/models/Bill";
import EmailTemplate from "@/models/EmailTemplate";
import { getEmailService, renderTemplate } from "@/lib/email/sendEmail";
import { REMINDER_SCOPE, REMINDER_BASIS, REMINDER_DIRECTION } from "@/lib/constants/statuses";
import "@/models/Customer";

/** The calendar date a reminder with this offset/direction should fire on, given a base date (due date or expected payment date). */
function targetDate(base: Date, offsetDays: number, direction: string): Date {
  return direction === REMINDER_DIRECTION.BEFORE ? subDays(base, offsetDays) : addDays(base, offsetDays);
}

async function sendReminderEmail(reminder: any, recipient: string, vars: Record<string, string | number>) {
  const key = `reminder:${reminder._id}`;
  let template = await EmailTemplate.findOne({ tenantId: reminder.tenantId, key });
  if (!template) {
    template = await EmailTemplate.create({
      tenantId: reminder.tenantId,
      key,
      name: reminder.name,
      subject: `Reminder: ${reminder.name}`,
      body: "Hi {{customerName}}, this is a reminder regarding {{documentNumber}} for {{amount}}.",
    });
  }
  const emailService = getEmailService();
  return emailService.send({
    to: recipient,
    subject: renderTemplate(template.subject, vars),
    body: renderTemplate(template.body, vars),
  });
}

/**
 * Evaluates every enabled automated Invoice reminder for a tenant against
 * real SalesInvoice due/expected-payment dates and sends the ones whose
 * target date is today. Called by app/api/cron/sales/reminders-evaluation.
 */
export async function evaluateInvoiceReminders(tenantId: string): Promise<{ evaluated: number; sent: number }> {
  const reminders = await Reminder.find({ tenantId, scope: REMINDER_SCOPE.INVOICE, enabled: true }).lean();
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  let sent = 0;

  for (const reminder of reminders) {
    const basis = reminder.basis || REMINDER_BASIS.DUE_DATE;
    const dateField = basis === REMINDER_BASIS.EXPECTED_PAYMENT_DATE ? "dueDate" : "dueDate"; // no separate expected-payment field on SalesInvoice today — both bases key off dueDate
    const invoices = await (SalesInvoice as any)
      .find({ tenantId, status: { $in: ["saved", "partially_paid", "overdue"] } })
      .populate("customerId", "header contact_details")
      .lean();

    for (const invoice of invoices) {
      const base = invoice[dateField];
      if (!base) continue;
      const fireOn = targetDate(new Date(base), reminder.offsetDays, reminder.direction);
      if (fireOn >= todayStart && fireOn <= todayEnd) {
        const email = invoice.customerId?.contact_details?.email;
        if (email) {
          await sendReminderEmail(reminder, email, {
            customerName: invoice.customerId?.header?.displayName || invoice.customerId?.header?.name || "Customer",
            documentNumber: invoice.number,
            amount: invoice.totalAmount,
          });
          sent++;
        }
      }
    }
    await Reminder.updateOne({ _id: reminder._id }, { $set: { lastEvaluatedAt: new Date() } });
  }

  return { evaluated: reminders.length, sent };
}

export async function evaluateBillReminders(tenantId: string): Promise<{ evaluated: number; sent: number }> {
  const reminders = await Reminder.find({ tenantId, scope: REMINDER_SCOPE.BILL, enabled: true }).lean();
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  let sent = 0;

  for (const reminder of reminders) {
    const bills = await (Bill as any).find({ tenantId }).lean();
    for (const bill of bills) {
      if (!bill.dueDate) continue;
      const fireOn = targetDate(new Date(bill.dueDate), reminder.offsetDays, reminder.direction);
      if (fireOn >= todayStart && fireOn <= todayEnd && bill.vendorEmail) {
        await sendReminderEmail(reminder, bill.vendorEmail, {
          customerName: bill.vendorName || "Vendor",
          documentNumber: bill.billNumber,
          amount: bill.total || 0,
        });
        sent++;
      }
    }
    await Reminder.updateOne({ _id: reminder._id }, { $set: { lastEvaluatedAt: new Date() } });
  }

  return { evaluated: reminders.length, sent };
}
