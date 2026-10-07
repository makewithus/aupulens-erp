const fs = require("fs");
const glob = require("glob");

const files = [
  "app/api/finance/purchase-orders/route.ts",
  "app/api/finance/bills/route.ts",
  "app/api/inventory/operations/manufacturing/route.ts",
  "app/api/inventory/operations/transfers/route.ts",
  "app/api/inventory/operations/returns/route.ts",
  "app/api/inventory/alerts/route.ts",
  "app/api/inventory/orders/route.ts",
  "app/api/inventory/stock-moves/route.ts",
  "app/api/inventory/warehouse/route.ts",
  "app/api/inventory/batch/route.ts",
  "app/api/sales/subscriptions/route.ts",
  "app/api/sales/payments/route.ts",
  "app/api/sales/sales-orders/route.ts",
  "app/api/sales/sale-orders/route.ts",
  "app/api/sales/invoices/route.ts",
  "app/api/sales/quotes/route.ts",
  "app/api/crm/cases/route.ts",
  "app/api/crm/opportunities/route.ts",
  "app/api/crm/leads/route.ts",
  "app/api/crm/documents/route.ts"
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  let modified = false;

  // Pattern 1: const re = { $regex: search.replace(...), $options: 'i' } OR "i"
  if (content.includes("const re = { $regex: search.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\"), $options: \"i\" };") || 
      content.includes("const re = { $regex: search.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&\'), $options: 'i' };")) {
    content = content.replace(
      /const re = \{ \$regex: search\.replace\(\/\[\.\*\+\?\^\$\{\}\(\)\|\[\\\\\]\\\\\\\\\]\/g, ["']\\\\\$&["']\), \$options: ["']i["'] \};/g,
      `const words = search.trim().split(/\\s+/).map((w) => w.replace(/[.*+?^\\$\\{\\}()|[\\]\\\\]/g, "\\\\$&"));
      const re = { $regex: words.join(".*"), $options: "i" };`
    );
    modified = true;
  }

  // Pattern 2: query.something = { $regex: search.replace(...), $options: "i" };
  const queryPropRegex = /(query(\.[a-zA-Z0-9_]+|\[["'][a-zA-Z0-9_\.]+["']\])) = \{ \$regex: search\.replace\(\/\[\.\*\+\?\^\$\{\}\(\)\|\[\\\\\]\\\\\\\\\]\/g, ["']\\\\\$&["']\), \$options: ["']i["'] \};/g;
  if (queryPropRegex.test(content)) {
    content = content.replace(
      queryPropRegex,
      `const words = search.trim().split(/\\s+/).map((w) => w.replace(/[.*+?^\\$\\{\\}()|[\\]\\\\]/g, "\\\\$&"));
      $1 = { $regex: words.join(".*"), $options: "i" };`
    );
    modified = true;
  }

  // Pattern 3: query.$or = [...] containing $regex: search
  if (content.includes("query.$or = [") && content.includes("$regex: search,")) {
    content = content.replace(
      /query\.\$or = \[\s*([\s\S]*?)\s*\];/g,
      (match, orContent) => {
        if (!orContent.includes("$regex: search,")) return match;
        // Extract all the fields being checked in the OR block
        const fields = [];
        const fieldRegex = /\{\s*"?([a-zA-Z0-9_\.]+)"?:\s*\{\s*\$regex:\s*search,\s*\$options:\s*["']i["']\s*\}\s*\}/g;
        let fm;
        while ((fm = fieldRegex.exec(orContent)) !== null) {
          fields.push(fm[1]);
        }
        
        if (fields.length > 0) {
          const mapCode = `const words = search.trim().split(/\\s+/).map(w => w.replace(/[.*+?^\\$\\{\\}()|[\\]\\\\]/g, "\\\\$&"));
      query.$and = words.map(word => ({
        $or: [
${fields.map(f => `          { "${f}": { $regex: word, $options: "i" } }`).join(",\n")}
        ]
      }));`;
          return mapCode;
        }
        return match;
      }
    );
    modified = true;
  }

  // Pattern 4: query.name = { $regex: search, $options: "i" };
  const simpleQueryRegex = /(query\.[a-zA-Z0-9_]+) = \{ \$regex: search, \$options: ["']i["'] \};/g;
  if (simpleQueryRegex.test(content)) {
    content = content.replace(
      simpleQueryRegex,
      `const words = search.trim().split(/\\s+/).map((w) => w.replace(/[.*+?^\\$\\{\\}()|[\\]\\\\]/g, "\\\\$&"));
      $1 = { $regex: words.join(".*"), $options: "i" };`
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(file, content);
    console.log("Updated: " + file);
  }
}
