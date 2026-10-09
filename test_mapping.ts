import { getEntitySchema } from "./lib/migration/registry";
import { suggestMapping } from "./lib/migration/validation";

const schema = getEntitySchema("customers");
if (schema) {
  const headers = ["Customer Code", "Customer Name", "Email Address", "Mobile", "Customer Type", "City", "State", "GSTIN", "Credit Limit", "Status"];
  const mapping = suggestMapping(schema, headers);
  console.log(mapping);
} else {
  console.log("No schema");
}
