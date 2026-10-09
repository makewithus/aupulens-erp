const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' });

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("No MongoDB URI");
    process.exit(1);
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('test');
  
  const customer = await db.collection('customers').findOne({ "header.name": "CUSV3-41020" });
  console.log("DB RECORD:", JSON.stringify(customer, null, 2));
  
  const record = await db.collection('migrationrecords').findOne({ "sourceData.Customer Name": "Devika Menon" });
  console.log("\nMIGRATION RECORD:", JSON.stringify(record, null, 2));
  
  await client.close();
  process.exit(0);
}
run().catch(console.dir);
