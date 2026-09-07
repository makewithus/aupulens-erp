const fs = require('fs');

const p2p3 = `
## P2 and P3 Test Cases (Edge Cases and Bounds)

This section covers the non-happy-path scenarios, data boundary testing, and secondary features for the workflows.

### Ingestion & Master Data
- **AI-01 P2**: Upload a bill with heavy noise (e.g. handwritten scribbles over amounts). Expectation: Low confidence flag or rejection.
- **AI-01 P3**: Upload an image format (JPEG/PNG) instead of PDF. Expectation: Extracted successfully.
- **AI-19 P2**: Modify a Customer name slightly. Expectation: Flagged as potential duplicate profile if similarity threshold crossed.
- **AI-20 P2**: Upload two companies with identical physical addresses but different GSTINs. Expectation: Flagged as 'probable' related party.

### Classification & Reconciliation
- **AI-02 P2**: Upload a bill with line items belonging to two different GL accounts (split coding). Expectation: AI handles split coding if historically trained.
- **AI-04 P2**: Submit an expense exactly AT the policy threshold. Expectation: Approved.
- **AI-27 P2**: Upload the same bill but with a slightly different date (e.g. 12/01 vs 01/12). Expectation: Still flagged as probable duplicate.
- **AI-03 P2**: Import a bank statement with a combined payment for multiple ERP bills (1-to-many match). Expectation: AI suggests candidates for human review.

### Schedules & Close
- **AI-07 P2**: Create an accrual that matches a GRNI exactly but has a small currency rounding difference. Expectation: Reversal proposed with variance.
- **AI-08 P2**: Change the amortization schedule mid-flight. Expectation: Schedule catches up or adjusts linearly based on policy.
- **AI-28 P2**: Document dated at 11:59 PM on the last day of the period. Expectation: Stays in current period, no cut-off error.
- **AI-11 P2**: Negative inventory check. Expectation: COGS anomaly generated.

### Analysis & Audit
- **AI-15 P2**: A transaction is 2x the normal amount, but below materiality threshold. Expectation: No anomaly generated (suppressed by materiality).
- **AI-21 P3**: Statement contains 10,000 lines. Expectation: AI gracefully chunks annotations without timing out.
- **AI-23 P2**: Post a journal with 99.999 precision. Expectation: Standard scoring, no round-number flag.
- **AI-18 P2**: Request evidence pack for a transaction lacking any attached PDFs. Expectation: Evidence pack notes missing support.
- **AI-30 P2**: Trigger a repair on a healthy schedule. Expectation: No action taken.
`;

fs.appendFileSync('docs/ai/AI_Workflow_Test.md', p2p3);
console.log('Successfully added P2 and P3 test cases.');
