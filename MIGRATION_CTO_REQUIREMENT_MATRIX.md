# MIGRATION CTO REQUIREMENT MATRIX

## 1. Input Support
| Requirement | Current Implementation | Relevant Files | API | DB | UI | Test | Status |
|---|---|---|---|---|---|---|---|
| CSV/XLS/XLSX | Uses `xlsx` to parse sheets | `sourceAdapters.ts` | Yes | - | Yes | - | IMPLEMENTED |
| XML/JSON | Basic generic flatten parser | `sourceAdapters.ts` | Yes | - | Yes | - | PARTIAL |
| ZIP / Multi-file | `adm-zip` extraction on upload | `batches/route.ts` | Yes | - | Yes | - | IMPLEMENTED |
| Tally Adapter | Specific `parseTallyXml` extracts Vouchers/Ledgers from TALLYMESSAGE | `sourceAdapters.ts` | Yes | - | Yes | - | IMPLEMENTED |
| Zoho Adapter | Specific `parseZohoExport` handles Zoho CSV/XML | `sourceAdapters.ts` | Yes | - | Yes | - | IMPLEMENTED |

## 2. Core Migration Architecture
| Requirement | Current Implementation | Relevant Files | API | DB | UI | Test | Status |
|---|---|---|---|---|---|---|---|
| Temporary Workspace | `MigrationBatch/Job/Record` models | `models/admin/*` | Yes | Yes | Yes | - | IMPLEMENTED |
| Source Detection | Passed from UI select, basic detection | `batches/route.ts` | Yes | - | Yes | - | PARTIAL |
| Module Detection | Basic substring matching on filename | `batches/route.ts` | Yes | - | No | - | PARTIAL |
| AI Mapping | Existing `fieldMapping.ts` used | `batches/[id]/mapping/route.ts` | Yes | - | Yes | - | IMPLEMENTED |
| Mapping Confidence | Confidence score not calculated/returned | `fieldMapping.ts` | No | - | No | - | MISSING |
| Ambiguous Mapping | No user resolution UI for ambiguity | `[id]/page.tsx` | No | - | No | - | MISSING |

## 3. Data Integrity & Validation
| Requirement | Current Implementation | Relevant Files | API | DB | UI | Test | Status |
|---|---|---|---|---|---|---|---|
| Deterministic Validation | Required fields + basic types | `worker.ts`, `validation.ts` | Yes | - | Yes | - | IMPLEMENTED |
| Duplicate Detection | Checks `dedupeKeys` | `worker.ts` | Yes | Yes | Yes | - | PARTIAL |
| Duplicate Resolution | Custom UI lets user pick Skip/Merge/Force | `PreviewAndResolution.tsx`, `resolve/route.ts` | Yes | Yes | Yes | - | IMPLEMENTED |
| Pre-migration editing | Added endpoint `/invalid` for inline editing | `invalid/route.ts` | Yes | - | Yes | - | PARTIAL |
| Relationship Preservation | No reference resolution for transactions | `worker.ts`, `importer.ts` | No | - | No | - | MISSING |

## 4. Entity Support
| Entity | Current Implementation | Relevant Files | Schema | Importer | UI | Test | Status |
|---|---|---|---|---|---|---|---|
| Customers | Schema & Importer exist | `entitySchemas.ts`, `importer.ts` | Yes | Yes | Yes | - | IMPLEMENTED |
| Vendors | Schema & Importer exist | `entitySchemas.ts`, `importer.ts` | Yes | Yes | Yes | - | IMPLEMENTED |
| Products | Schema & Importer exist | `entitySchemas.ts`, `importer.ts` | Yes | Yes | Yes | - | IMPLEMENTED |
| Sales / Invoices | Constants added, but NO Schema/Importer | `entitySchemas.ts` | No | No | No | - | MISSING |
| Invoice Items | Same as Sales Invoices | - | No | No | No | - | MISSING |
| Purchases | Missing | - | No | No | No | - | MISSING |
| Payments/Receipts | Missing | - | No | No | No | - | MISSING |
| Expenses | Missing | - | No | No | No | - | MISSING |
| Tax | Missing | - | No | No | No | - | MISSING |
| Accounting / Ledgers | Missing | - | No | No | No | - | MISSING |
| Employees | Missing | - | No | No | No | - | MISSING |

## 5. UI / UX
| Requirement | Current Implementation | Relevant Files | API | DB | UI | Test | Status |
|---|---|---|---|---|---|---|---|
| Real Aupulens Preview | Only shows summary counts | `[id]/page.tsx` | No | - | No | - | MISSING |
| Final confirmation | Button exists | `[id]/page.tsx` | Yes | - | Yes | - | IMPLEMENTED |
| Progress | Worker updates % in Batch | `worker.ts`, `[id]/page.tsx` | Yes | Yes | Yes | - | IMPLEMENTED |
| Downloadable Report | Added `/report` endpoint generating detailed txt | `[id]/page.tsx`, `report/route.ts` | Yes | - | Yes | - | IMPLEMENTED |
| Existing Design | Basic Tailwind used, needs deeper audit | `[id]/page.tsx` | - | - | PARTIAL | - | PARTIAL |

## 6. Execution & Verification
| Requirement | Current Implementation | Relevant Files | API | DB | UI | Test | Status |
|---|---|---|---|---|---|---|---|
| Background Processing | HTTP chunks from client polling | `worker.ts` | Yes | - | Yes | - | PARTIAL |
| Retry / Resume | Batch tracks pending records, resumes on poll | `worker.ts` | Yes | Yes | Yes | - | PARTIAL |
| Idempotency | Batch state check, but race conditions possible | `worker.ts` | Yes | - | - | - | PARTIAL |
| Post-migration verify | No verification logic comparing DB | - | No | - | No | - | MISSING |
| Large Dataset Testing | Not performed | - | - | - | - | No | MISSING |
| Tenant Isolation/RBAC | API checks `tenantId`, worker injects | `worker.ts` | Yes | Yes | - | - | IMPLEMENTED |
