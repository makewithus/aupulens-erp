import { describe, expect, it } from "vitest";
import { computeHsnSummary, computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { buildGstReport } from "@/lib/tax/gstReport";
import { allocatePaise } from "@/lib/accounting/allocatePaise";
const paise=(n:number)=>Math.round(n*100);
describe("AUP-014: independent HSN/report rounding conservation",()=>{
 it.each([0.01,0.03,1.01,10.05,99.99,100000000.01])("allocates %s exactly in paise",total=>{
  expect(allocatePaise(total,[1,1,1,3]).reduce((s,n)=>s+paise(n),0)).toBe(paise(total));
 });
 it("reconciles multiple HSN rows and intra-state heads to one rounded invoice tax",()=>{
  const totals=computeInvoiceTotals({sellerState:"Maharashtra",placeOfSupply:"Maharashtra",lineItems:[{qty:1,unitPrice:0.03,discount:0,discountMode:"amount",taxRate:18,hsn:"1"},{qty:1,unitPrice:0.03,discount:0,discountMode:"amount",taxRate:18,hsn:"2"}]});
  const summary=computeHsnSummary(totals.computedLines,false);
  expect(summary.reduce((s,r)=>s+paise(r.totalTax),0)).toBe(paise(totals.totalTax));
  expect(summary.reduce((s,r)=>s+paise(r.cgstAmount),0)).toBe(paise(totals.cgst));
  expect(summary.reduce((s,r)=>s+paise(r.sgstAmount),0)).toBe(paise(totals.sgst));
 });
 it("GST report respects an explicit zero tax rather than recomputing nonzero tax",()=>{
  const rows=buildGstReport([{totalTax:0,lineItems:[{hsn:"1",qty:1,unitPrice:100,taxRate:18,taxAmount:0,taxableValue:100,lineTotal:100}]}]);
  expect(rows[0].taxAmount).toBe(0);
 });
 it("reconciles HSN report allocation to saved invoice tax for fractional multi-HSN lines",()=>{
  const invoice=computeInvoiceTotals({sellerState:"Delhi",placeOfSupply:"Haryana",lineItems:[{qty:1,unitPrice:0.03,discount:0,discountMode:"amount",taxRate:18,hsn:"1"},{qty:1,unitPrice:0.03,discount:0,discountMode:"amount",taxRate:18,hsn:"2"}]});
  const rows=buildGstReport([{totalTax:invoice.totalTax,lineItems:invoice.computedLines}]);
  expect(rows.reduce((s,r)=>s+paise(r.taxAmount),0)).toBe(paise(invoice.totalTax));
 });
});
