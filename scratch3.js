const fs = require("fs");
const files = [
  "app/api/finance/purchase-orders/route.ts",
  "app/api/inventory/operations/transfers/route.ts",
  "app/api/inventory/operations/returns/route.ts",
  "app/api/inventory/alerts/route.ts",
  "app/api/inventory/orders/route.ts",
  "app/api/inventory/warehouse/route.ts",
  "app/api/inventory/batch/route.ts",
  "app/api/sales/sale-orders/route.ts"
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  
  if (content.includes("const re = { $regex: search.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\"), $options: \"i\" };")) {
    content = content.replace(
      "const re = { $regex: search.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\"), $options: \"i\" };",
      `const words = search.trim().split(/\\s+/).map((w) => w.replace(/[.*+?^\\$\\{\\}()|[\\]\\\\]/g, "\\\\$&"));
      const re = { $regex: words.join(".*"), $options: "i" };`
    );
    fs.writeFileSync(file, content);
    console.log("Updated: " + file);
  } else if (content.includes("const re = { $regex: search.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), $options: 'i' };")) {
    content = content.replace(
      "const re = { $regex: search.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), $options: 'i' };",
      `const words = search.trim().split(/\\s+/).map((w) => w.replace(/[.*+?^\\$\\{\\}()|[\\]\\\\]/g, "\\\\$&"));
      const re = { $regex: words.join(".*"), $options: "i" };`
    );
    fs.writeFileSync(file, content);
    console.log("Updated: " + file);
  } else {
    console.log("Failed to match: " + file);
  }
}
