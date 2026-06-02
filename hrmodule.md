Based on the developer documentation, the Human Resource Management (HRM) and Payroll module is designed to manage employees and their salaries. In this ERP system, HR and Payroll are not independent sources of truth; they must strictly feed into the central accounting engine, as any module existing without an accounting impact is considered a "fake ERP".
Here is the detailed, structured breakdown of the HRM and Payroll functionalities exactly as specified in the document:
1. The "Hire to Retire" Lifecycle
This section covers the core administrative and lifecycle management of an employee from the moment they are hired until they leave the company.
Functional Steps:
Candidate hired
Employee created
Onboarding tasks
Attendance & payroll
Performance cycles
Exit initiation
Clearance
Workflow Flowchart: [Hire] → [Employee Created] → [Onboarding] → [Active Employment] → [Exit Initiated] → [Clearance]
2. The Payroll Control Cycle (Oracle HCM Inspired)
This section defines the rigorous workflow required to process, approve, and disburse employee salaries while ensuring the financial ledger is updated.
Functional Steps:
Attendance locked
Payroll computed
Payroll reviewed
Payroll approved
Salary disbursed
Payroll posted to GL (General Ledger)
Workflow Flowchart: [Attendance] → [Compute Payroll] → [Approval] → [Disburse]
3. Mandatory Accounting Integration
Because accounting is the final source of truth in this ERP, the payroll module is required to automatically generate specific double-entry journal records.
The exact accounting flow for payroll is:
During Payroll Calculation: The system must record a Debit (Dr) to the Salary Expense account and a Credit (Cr) to the Salary Payable account.
During Salary Disbursement (Payment): The system must record a Debit (Dr) to the Salary Payable account and a Credit (Cr) to the Bank account