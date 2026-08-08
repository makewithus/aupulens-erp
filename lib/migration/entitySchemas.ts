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
  dedupeKeys: ["sku", "name"],
  fields: [
    { key: "name", label: "Product Name", required: true, aliases: ["name", "product", "item", "itemname", "description", "particulars"], validate: "nonEmpty" },
    { key: "sku", label: "SKU / Code", required: false, aliases: ["sku", "code", "itemcode", "default_code", "partno", "productcode"] },
    { key: "type", label: "Type (consu/service/combo)", required: false, aliases: ["type", "producttype", "kind"] },
    { key: "salesPrice", label: "Sales Price", required: false, aliases: ["salesprice", "sales price", "listprice", "price", "rate", "mrp", "sellingprice"], validate: "number" },
    { key: "cost", label: "Cost Price", required: false, aliases: ["cost", "costprice", "purchaseprice", "standardprice", "buyprice"], validate: "number" },
    // NOTE: HSN/SAC is intentionally omitted — the Product model has no HSN field
    // yet (invoices carry HSN as free text). Add it here once Product gains one.
    { key: "description", label: "Description", required: false, aliases: ["description", "desc", "details", "notes"] },
  ],
};

const SCHEMAS: Record<MigrationEntity, EntitySchema> = {
  [MIGRATION_ENTITY.CUSTOMER]: CUSTOMER_SCHEMA,
  [MIGRATION_ENTITY.VENDOR]: VENDOR_SCHEMA,
  [MIGRATION_ENTITY.PRODUCT]: PRODUCT_SCHEMA,
};

export function getEntitySchema(entity: string): EntitySchema | null {
  return (SCHEMAS as Record<string, EntitySchema>)[entity] ?? null;
}

export function listEntitySchemas(): EntitySchema[] {
  return Object.values(SCHEMAS);
}
