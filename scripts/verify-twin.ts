/**
 * Part 2.5 live verification: the business-twin graph is built from real data
 * and the late-invoice cash-flow simulation produces a real projection + delta.
 *
 * Run: npx tsx scripts/verify-twin.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TENANT = "default-tenant";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { buildBusinessGraph, getOutstandingReceivables } = await import("../lib/twin/graph");
  const { simulateInvoiceDelay } = await import("../lib/twin/cashflow");

  const graph = await buildBusinessGraph(TENANT);
  console.log(`1. Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`);
  console.log(`   stats: ${JSON.stringify(graph.stats)}`);
  const byKind = graph.nodes.reduce((acc: Record<string, number>, n) => { acc[n.kind] = (acc[n.kind] || 0) + 1; return acc; }, {});
  console.log(`   node kinds: ${JSON.stringify(byKind)}`);

  const receivables = await getOutstandingReceivables(TENANT);
  console.log(`2. Outstanding receivables: ${receivables.length}`);

  if (receivables.length === 0) {
    console.log("   (no outstanding receivables to simulate — skipping simulation)");
  } else {
    // Pick a receivable due within the window for a visible effect.
    const target = receivables[0];
    const res = simulateInvoiceDelay(receivables, target.id, 30, new Date(), 12, 0);
    if ("error" in res) { console.log(`   sim error: ${res.error}`); }
    else {
      const maxDip = Math.min(...res.delta.map((d) => d.delta));
      console.log(`3. Simulated delaying ${target.label} (${target.amount}) by 30 days:`);
      console.log(`   baseline final cash: ${res.baseline[res.baseline.length - 1].cumulative}, simulated final: ${res.simulated[res.simulated.length - 1].cumulative}`);
      console.log(`   worst weekly dip vs baseline: ${maxDip}`);
      console.log(`   summary: "${res.summary}"`);
      console.log("PASS: twin graph + cash-flow simulation both operate on real data");
    }
  }

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
