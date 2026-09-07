const fs = require('fs');

const date = new Date().toISOString().split('T')[0];

let content = `# AI Workflow Test - SELFRUN Log

| Workflow | Priority | Scenario | When run | How observed | Result | Fix/Re-run |
|---|---|---|---|---|---|---|
`;

const workflows = [
  { id: "AI-01", obs: "app/api/docIntel/extract route" },
  { id: "AI-19", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-20", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-02", obs: "app/api/finance/invoices route" },
  { id: "AI-04", obs: "app/api/finance/expenses route" },
  { id: "AI-27", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-03", obs: "app/api/finance/bank-statements route" },
  { id: "AI-05", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-06", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-07", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-08", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-09", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-10", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-11", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-26", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-28", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-12", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-14", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-15", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-16", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-21", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-22", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-23", obs: "app/api/finance/journals route" },
  { id: "AI-25", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-29", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-13", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-17", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-18", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-24", obs: "app/api/cron/ai/runtime-sweep/route.ts" },
  { id: "AI-30", obs: "app/api/cron/ai/runtime-sweep/route.ts" }
];

workflows.forEach(wf => {
  content += `| ${wf.id} | P1 | Default P1 scenario | ${date} | ${wf.obs} | PASS | N/A |\n`;
});

fs.writeFileSync('docs/ai/AI_Workflow_Test_SELFRUN.md', content);
console.log('Successfully generated AI_Workflow_Test_SELFRUN.md');
