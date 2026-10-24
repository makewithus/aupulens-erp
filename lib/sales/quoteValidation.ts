import { z } from "zod";
const finite = z.number().finite();
export const quoteLineSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  qty: finite.positive("Quantity must be greater than zero"),
  unitPrice: finite.nonnegative("Unit price cannot be negative"),
  discount: finite.nonnegative("Discount cannot be negative").default(0),
  discountMode: z.enum(["percent", "amount"]).default("percent"),
  taxRate: finite.min(0).max(100).default(0),
}).passthrough().superRefine((line, ctx) => {
  if (line.discountMode === "percent" && line.discount > 100) ctx.addIssue({ code: "custom", path: ["discount"], message: `A ${line.discount}% discount is not allowed. The maximum is 100%.` });
  if (line.discountMode === "amount" && line.discount > line.qty * line.unitPrice) ctx.addIssue({ code: "custom", path: ["discount"], message: "Discount cannot exceed the line amount." });
});
export function validateQuoteInput(body: any): string[] {
  const result = z.object({
    lineItems: z.array(quoteLineSchema).min(1, "At least one line item is required"),
    itemLevelDiscountPercent: finite.min(0).max(100).optional(),
    extraDiscount: finite.nonnegative().optional(),
    extraDiscountMode: z.enum(["percent", "amount"]).optional(),
    adjustment: finite.optional(),
  }).passthrough().safeParse(body);
  if (!result.success) return result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`);
  if (body.extraDiscountMode === "percent" && body.extraDiscount > 100) return ["Extra discount cannot exceed 100%."];
  return [];
}
