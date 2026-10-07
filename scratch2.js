const fs = require("fs");
const files = [
  "app/api/finance/purchase-orders/route.ts",
  "app/api/inventory/operations/transfers/route.ts",
  "app/api/inventory/operations/returns/route.ts",
  "app/api/inventory/alerts/route.ts",
  "app/api/inventory/orders/route.ts",
  "app/api/inventory/warehouse/route.ts",
  "app/api/inventory/batch/route.ts",
  "app/api/sales/sale-orders/route.ts",
  "app/api/sales/invoices/route.ts",
  "app/api/crm/documents/route.ts"
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  let modified = false;

  // Replace `const re = { $regex: search.replace(..., '\$&'), $options: 'i' };`
  // Replace `query.number = { $regex: search, $options: "i" };`
  // Replace `query.name = { $regex: search, $options: "i" };`

  if (content.match(/const re = \{ \$regex: search\.replace[^}]+\};/)) {
    content = content.replace(
      /const re = \{ \$regex: search\.replace[^}]+\};/,
      `const words = search.trim().split(/\\s+/).map(w => w.replace(/[.*+?^\\$\\{\\}()|[\\]\\\\]/g, "\\\\$&"));\n      const re = { $regex: words.join(".*"), $options: "i" };`
    );
    modified = true;
  }

  if (content.match(/query\.([a-zA-Z0-9_]+) = \{ \$regex: search, \$options: ["']i["'] \};/)) {
    content = content.replace(
      /query\.([a-zA-Z0-9_]+) = \{ \$regex: search, \$options: ["']i["'] \};/g,
      `const words = search.trim().split(/\\s+/).map(w => w.replace(/[.*+?^\\$\\{\\}()|[\\]\\\\]/g, "\\\\$&"));\n      query.$1 = { $regex: words.join(".*"), $options: "i" };`
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(file, content);
    console.log("Updated: " + file);
  }
}
