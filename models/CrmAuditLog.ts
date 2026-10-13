/**
 * Canonical CrmAuditLog Forwarder
 *
 * Re-exports the authoritative CRM audit log model from models/crm/CrmAuditLog.ts.
 * Prevents model registration collisions, OverwriteModelError, and divergent schema definitions.
 */
export * from "./crm/CrmAuditLog";
export { default } from "./crm/CrmAuditLog";
