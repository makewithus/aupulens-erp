import dbConnect from "@/lib/db";
import CrmDocument from "@/models/crm/CrmDocument";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

export type LinkedRecordType =
  | "Lead"
  | "Account"
  | "Contact"
  | "Opportunity"
  | "Quote"
  | "Contract"
  | "Case";

export interface CreateDocumentInput {
  tenantId: string;
  name: string;
  file_url: string;
  file_type?: string;
  linked_record_type: LinkedRecordType;
  linked_record_id: string;
  parent_document_id?: string;
  uploaded_by_id: string;
}

export async function createDocument(input: CreateDocumentInput) {
  await dbConnect();

  let version = 1;
  if (input.parent_document_id) {
    const parent = await CrmDocument.findOne({
      _id: input.parent_document_id,
      tenantId: input.tenantId,
    });
    if (parent) {
      version = parent.version + 1;
    }
  }

  const doc = await CrmDocument.create({
    tenantId: input.tenantId,
    name: input.name,
    file_url: input.file_url,
    file_type: input.file_type,
    linked_record_type: input.linked_record_type,
    linked_record_id: input.linked_record_id,
    parent_document_id: input.parent_document_id,
    uploaded_by_id: input.uploaded_by_id,
    version,
    is_archived: false,
    download_count: 0,
  });

  await CrmAuditLog.create({
    tenantId: input.tenantId,
    user_id: input.uploaded_by_id,
    action: "upload",
    record_type: "Document",
    record_id: doc._id,
    timestamp: new Date(),
  });

  return doc;
}

export async function getDocumentsForRecord(
  tenantId: string,
  linked_record_id: string,
  linked_record_type?: LinkedRecordType,
  includeArchived = false
) {
  await dbConnect();
  const query: Record<string, unknown> = { tenantId, linked_record_id };
  if (linked_record_type) query.linked_record_type = linked_record_type;
  if (!includeArchived) query.is_archived = false;

  return CrmDocument.find(query)
    .populate("uploaded_by_id", "name email")
    .sort({ createdAt: -1 })
    .lean();
}

export async function getDocumentVersionHistory(
  tenantId: string,
  documentId: string
) {
  await dbConnect();
  const root = await CrmDocument.findOne({
    _id: documentId,
    tenantId,
  }).lean();
  if (!root) return [];

  // Walk back to root via parent chain
  const versions: typeof root[] = [root];
  let current: typeof root | null = root;

  while (current && (current as any).parent_document_id) {
    const parent = await CrmDocument.findOne({
      _id: (current as any).parent_document_id,
      tenantId,
    }).lean();
    if (parent) {
      versions.push(parent);
      current = parent;
    } else {
      break;
    }
  }

  return versions.sort((a, b) => (b as any).version - (a as any).version);
}

export async function archiveDocument(
  tenantId: string,
  documentId: string,
  userId: string
) {
  await dbConnect();
  const doc = await CrmDocument.findOne({ _id: documentId, tenantId });
  if (!doc) throw new Error("Document not found");

  doc.is_archived = true;
  await doc.save();

  await CrmAuditLog.create({
    tenantId,
    user_id: userId,
    action: "status_changed",
    record_type: "Document",
    record_id: doc._id,
    old_value: "active",
    new_value: "archived",
    timestamp: new Date(),
  });

  return doc;
}

export async function trackDocumentDownload(
  tenantId: string,
  documentId: string,
  userId: string
) {
  await dbConnect();
  const doc = await CrmDocument.findOne({ _id: documentId, tenantId });
  if (!doc) throw new Error("Document not found");

  doc.download_count += 1;
  await doc.save();

  await CrmAuditLog.create({
    tenantId,
    user_id: userId,
    action: "download",
    record_type: "Document",
    record_id: doc._id,
    timestamp: new Date(),
  });

  return doc;
}
