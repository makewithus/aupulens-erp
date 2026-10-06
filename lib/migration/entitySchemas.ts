/**
 * Canonical target-field definitions per importable entity.
 *
 * This is the single source of truth the whole migration pipeline reads:
 *  - the mapper suggests sourceColumn -> field.key using `aliases`
 *  - the validator enforces `required` and `validate`
 *  - the importer's transform (importer.ts) reads mapped values by field.key
 *
 * Keep field.key stable — it's the contract between mapping, validation and the
 * importer's transform functions.
 */

import { MIGRATION_ENTITY, type MigrationEntity } from "@/lib/migration/constants";

export type FieldValidator =
  | "email"
  | "phone"
  | "gstin"
  | "number"
  | "nonEmpty";

export interface TargetField {
  key: string;
  label: string;
  required: boolean;
  /** Lowercased header fragments that hint this field during auto-mapping. */
  aliases: string[];
  /** Optional format check applied by the validation engine. */
  validate?: FieldValidator;
  help?: string;
}

export interface EntitySchema {
  entity: MigrationEntity;
  label: string;
  fields: TargetField[];
  /**
   * Field keys used to detect duplicates (within the file and against existing
   * records). A row matches an existing record if ALL non-empty keys match.
   */
  dedupeKeys: string[];
}

const CUSTOMER_SCHEMA: EntitySchema = {
  entity: MIGRATION_ENTITY.CUSTOMER,
  label: "Customers",
  dedupeKeys: ["gstin", "email", "name"],
  fields: [
    { key: "sourceId", label: "Source / External ID", required: false, aliases: ["sourceid", "guid", "externalid"] },
    { key: "name", label: "Name / Company", required: true, aliases: ["name", "customer", "party", "companyname", "company", "ledgername", "account name"], validate: "nonEmpty" },
    { key: "displayName", label: "Display Name", required: false, aliases: ["displayname", "display name", "shortname", "alias"] },
    { key: "email", label: "Email", required: false, aliases: ["email", "e-mail", "emailid", "mail"], validate: "email" },
    { key: "phone", label: "Phone", required: false, aliases: ["phone", "telephone", "landline", "contact"], validate: "phone" },
    { key: "mobile", label: "Mobile", required: false, aliases: ["mobile", "cell", "mobileno", "whatsapp"], validate: "phone" },
    { key: "gstin", label: "GSTIN", required: false, aliases: ["gstin", "gst", "gstno", "gst number", "gstnumber", "taxid"], validate: "gstin" },
    { key: "pan", label: "PAN", required: false, aliases: ["pan", "panno", "pan number"] },
    { key: "street", label: "Address Line 1", required: false, aliases: ["street", "address", "address1", "addressline1", "add1"] },
    { key: "street2", label: "Address Line 2", required: false, aliases: ["street2", "address2", "addressline2", "add2"] },
    { key: "city", label: "City", required: false, aliases: ["city", "town", "district"] },
    { key: "stateName", label: "State", required: false, aliases: ["state", "statename", "region", "province"] },
    { key: "zip", label: "Pincode / ZIP", required: false, aliases: ["zip", "pincode", "pin", "postal", "postcode"] },
    { key: "openingBalance", label: "Opening Balance", required: false, aliases: ["openingbalance", "opening balance", "balance", "outstanding"], validate: "number" },
  ],
};

const VENDOR_SCHEMA: EntitySchema = {
  entity: MIGRATION_ENTITY.VENDOR,
  label: "Vendors",
  dedupeKeys: ["gstin", "contactEmail", "name"],
  fields: [
    { key: "sourceId", label: "Source / External ID", required: false, aliases: ["sourceid", "guid", "externalid"] },
    { key: "name", label: "Vendor Name", required: true, aliases: ["name", "vendor", "supplier", "party", "companyname", "ledgername"], validate: "nonEmpty" },
    { key: "category", label: "Category", required: false, aliases: ["category", "type", "group", "vendortype"] },
    { key: "contactEmail", label: "Email", required: false, aliases: ["email", "e-mail", "emailid", "mail"], validate: "email" },
    { key: "phone", label: "Phone", required: false, aliases: ["phone", "mobile", "contact", "telephone"], validate: "phone" },
    { key: "gstin", label: "GSTIN", required: false, aliases: ["gstin", "gst", "gstno", "gst number", "taxid"], validate: "gstin" },
    { key: "address", label: "Address", required: false, aliases: ["address", "street", "location"] },
  ],
};

const PRODUCT_SCHEMA: EntitySchema = {
  entity: MIGRATION_ENTITY.PRODUCT,
  label: "Products",
  dedupeKeys: ["sku"],
  fields: [
    { key: "sourceId", label: "Source / External ID", required: false, aliases: ["sourceid", "source id", "guid", "externalid", "external id", "productcode", "product code", "productid", "product id"] },
    { key: "name", label: "Product Name", required: true, aliases: ["name", "product", "productname", "product name", "item", "itemname", "description", "particulars"], validate: "nonEmpty" },
    { key: "sku", label: "SKU / Code", required: false, aliases: ["sku", "code", "itemcode", "item code", "default_code", "partno", "productcode", "product code", "productid", "product id"] },
    { key: "category", label: "Category", required: false, aliases: ["category", "productcategory", "product category", "categ", "group"] },
    { key: "subcategory", label: "Subcategory", required: false, aliases: ["subcategory", "sub category", "subcat"] },
    { key: "brand", label: "Brand", required: false, aliases: ["brand", "manufacturer", "make"] },
    { key: "type", label: "Type (consu/service/combo)", required: false, aliases: ["type", "producttype", "product type", "kind"] },
    { key: "salesPrice", label: "Sales Price", required: false, aliases: ["salesprice", "sales price", "unitprice", "unit price", "listprice", "price", "rate", "mrp", "sellingprice", "selling price"], validate: "number" },
    { key: "cost", label: "Cost Price", required: false, aliases: ["cost", "costprice", "purchaseprice", "standardprice", "buyprice"], validate: "number" },
    { key: "stockQuantity", label: "Stock Quantity", required: false, aliases: ["stockquantity", "stock quantity", "availablequantity", "available quantity", "qty", "quantity", "onhand", "on hand"], validate: "number" },
    { key: "status", label: "Status", required: false, aliases: ["status", "productstatus", "product status", "state"] },
    // NOTE: HSN/SAC is intentionally omitted — the Product model has no HSN field
    // yet (invoices carry HSN as free text). Add it here once Product gains one.
    { key: "description", label: "Description", required: false, aliases: ["description", "desc", "details", "notes"] },
  ],
};

const SALES_INVOICE_SCHEMA: EntitySchema = {
  entity: MIGRATION_ENTITY.SALES_INVOICE,
  label: "Sales Invoices",
  dedupeKeys: ["number"],
  fields: [
    { key: "sourceId", label: "Source / External ID", required: false, aliases: ["sourceid", "guid", "externalid"] },
    { key: "number", label: "Invoice Number", required: true, aliases: ["invoicenumber", "invno", "docnum", "voucherno"], validate: "nonEmpty" },
    { key: "customerName", label: "Customer Name", required: true, aliases: ["customer", "party", "buyer", "client"], validate: "nonEmpty" },
    { key: "invoiceDate", label: "Invoice Date", required: true, aliases: ["date", "invoicedate", "docdate"] },
    { key: "totalAmount", label: "Total Amount", required: true, aliases: ["total", "amount", "netamount", "grandtotal"], validate: "number" },
  ],
};

const INVOICE_ITEM_SCHEMA: EntitySchema = {
  entity: MIGRATION_ENTITY.INVOICE_ITEM,
  label: "Invoice Line Items",
  dedupeKeys: ["invoiceSourceId", "productName", "qty", "unitPrice"],
  fields: [
    { key: "invoiceSourceId", label: "Invoice Number / ID", required: true, aliases: ["invoicenumber", "invno", "docnum", "voucherno", "invoice_id"] },
    { key: "productSourceId", label: "Product Code / ID", required: false, aliases: ["productcode", "itemcode", "sku", "product_id"] },
    { key: "productName", label: "Product Name", required: true, aliases: ["itemname", "product", "item", "description", "particulars"] },
    { key: "qty", label: "Quantity", required: true, aliases: ["quantity", "qty"], validate: "number" },
    { key: "unitPrice", label: "Unit Price", required: true, aliases: ["rate", "price", "unitprice"], validate: "number" },
    { key: "lineTotal", label: "Line Total", required: true, aliases: ["amount", "total", "linetotal"], validate: "number" },
    { key: "discount", label: "Discount", required: false, aliases: ["discount", "disc"] },
    { key: "taxRate", label: "Tax Rate %", required: false, aliases: ["taxrate", "gst", "tax"] },
    { key: "hsn", label: "HSN / SAC", required: false, aliases: ["hsn", "sac", "hsncode"] },
  ],
};

const PURCHASE_INVOICE_SCHEMA: EntitySchema = {
  entity: MIGRATION_ENTITY.PURCHASE_INVOICE,
  label: "Purchase Invoices",
  dedupeKeys: ["number", "vendorName"],
  fields: [
    { key: "sourceId", label: "Source / External ID", required: false, aliases: ["sourceid", "guid", "externalid"] },
    { key: "number", label: "Bill / Invoice Number", required: true, aliases: ["billno", "invoicenumber", "docnum", "voucherno"], validate: "nonEmpty" },
    { key: "vendorName", label: "Vendor Name", required: true, aliases: ["vendor", "supplier", "party", "creditor"], validate: "nonEmpty" },
    { key: "invoiceDate", label: "Bill Date", required: true, aliases: ["date", "billdate", "docdate"] },
    { key: "totalAmount", label: "Total Amount", required: true, aliases: ["total", "amount", "netamount", "grandtotal"], validate: "number" },
  ],
};

const PAYMENT_SCHEMA: EntitySchema = {
  entity: MIGRATION_ENTITY.PAYMENT,
  label: "Payments / Receipts",
  dedupeKeys: ["reference", "date", "amount"],
  fields: [
    { key: "sourceId", label: "Source / External ID", required: false, aliases: ["sourceid", "guid", "externalid"] },
    { key: "type", label: "Type (Payment/Receipt)", required: true, aliases: ["type", "vouchertype", "receipt"] },
    { key: "partyName", label: "Party Name", required: true, aliases: ["party", "customer", "vendor", "account"] },
    { key: "amount", label: "Amount", required: true, aliases: ["amount", "value", "total"], validate: "number" },
    { key: "date", label: "Date", required: true, aliases: ["date", "paymentdate", "receiptdate"] },
    { key: "reference", label: "Reference / Cheque No", required: false, aliases: ["ref", "reference", "cheque", "utr"] },
  ],
};

const EXPENSE_SCHEMA: EntitySchema = {
  entity: MIGRATION_ENTITY.EXPENSE,
  label: "Expenses",
  dedupeKeys: ["date", "amount", "expenseAccount"],
  fields: [
    { key: "sourceId", label: "Source / External ID", required: false, aliases: ["sourceid", "guid", "externalid"] },
    { key: "date", label: "Date", required: true, aliases: ["date", "expensedate"] },
    { key: "expenseAccount", label: "Expense Account", required: true, aliases: ["account", "category", "head", "expensehead"] },
    { key: "amount", label: "Amount", required: true, aliases: ["amount", "value"], validate: "number" },
    { key: "reference", label: "Reference", required: false, aliases: ["ref", "billno", "reference"] },
    { key: "paidThrough", label: "Paid Through (Bank/Cash)", required: false, aliases: ["paidfrom", "bank", "cash"] },
  ],
};

const ACCOUNT_SCHEMA: EntitySchema = {
  entity: MIGRATION_ENTITY.ACCOUNT,
  label: "Chart of Accounts / Ledgers",
  dedupeKeys: ["accountName"],
  fields: [
    { key: "sourceId", label: "Source / External ID", required: false, aliases: ["sourceid", "guid", "externalid"] },
    { key: "accountName", label: "Account Name", required: true, aliases: ["name", "ledgername", "accountname"], validate: "nonEmpty" },
    { key: "accountCode", label: "Account Code", required: false, aliases: ["code", "accountcode", "ledgercode"] },
    { key: "accountType", label: "Account Type / Group", required: false, aliases: ["type", "group", "under", "category"] },
    { key: "openingBalance", label: "Opening Balance", required: false, aliases: ["openingbalance", "balance", "opbal"], validate: "number" },
  ],
};

const EMPLOYEE_SCHEMA: EntitySchema = {
  entity: MIGRATION_ENTITY.EMPLOYEE,
  label: "Employees",
  dedupeKeys: ["email", "employeeId"],
  fields: [
    { key: "sourceId", label: "Source / External ID", required: false, aliases: ["sourceid", "source id", "guid", "externalid", "external id"] },
    { key: "firstName", label: "First Name", required: true, aliases: ["firstname", "first name", "fname", "name", "fullname", "full name", "employee name"], validate: "nonEmpty" },
    { key: "lastName", label: "Last Name", required: false, aliases: ["lastname", "lname"] },
    { key: "email", label: "Email", required: false, aliases: ["email", "emailid", "workemail", "work email"], validate: "email" },
    { key: "employeeId", label: "Employee ID", required: false, aliases: ["empid", "employeeid", "employee id", "employee code", "employeecode", "id"] },
    { key: "phone", label: "Phone", required: false, aliases: ["phone", "mobile", "mobile number", "contact"], validate: "phone" },
    { key: "department", label: "Department", required: false, aliases: ["department", "dept"] },
    { key: "designation", label: "Designation", required: false, aliases: ["designation", "title", "jobtitle", "job title"] },
    { key: "joiningDate", label: "Joining Date", required: false, aliases: ["joiningdate", "joining date", "datejoined", "date joined", "dateofjoining", "date of joining", "doj"] },
    { key: "status", label: "Status", required: false, aliases: ["status", "employment status", "employeestatus", "employee status", "state"] },
  ],
};

const SCHEMAS: Partial<Record<MigrationEntity, EntitySchema>> = {
  [MIGRATION_ENTITY.CUSTOMER]: CUSTOMER_SCHEMA,
  [MIGRATION_ENTITY.VENDOR]: VENDOR_SCHEMA,
  [MIGRATION_ENTITY.PRODUCT]: PRODUCT_SCHEMA,
  [MIGRATION_ENTITY.SALES_INVOICE]: SALES_INVOICE_SCHEMA,
  [MIGRATION_ENTITY.INVOICE_ITEM]: INVOICE_ITEM_SCHEMA,
  [MIGRATION_ENTITY.PURCHASE_INVOICE]: PURCHASE_INVOICE_SCHEMA,
  [MIGRATION_ENTITY.PAYMENT]: PAYMENT_SCHEMA,
  [MIGRATION_ENTITY.EXPENSE]: EXPENSE_SCHEMA,
  [MIGRATION_ENTITY.ACCOUNT]: ACCOUNT_SCHEMA,
  [MIGRATION_ENTITY.EMPLOYEE]: EMPLOYEE_SCHEMA,
};

export function getEntitySchema(entity: string): EntitySchema | null {
  return (SCHEMAS as Record<string, EntitySchema>)[entity] ?? null;
}

export function listEntitySchemas(): EntitySchema[] {
  return Object.values(SCHEMAS);
}
