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
  
  const records = await db.collection('migrationrecords').find({ "sourceData.Customer Name": "Devika Menon" }).toArray();
  console.log("ALL MIGRATION RECORDS:", JSON.stringify(records, null, 2));
  
  await client.close();
  process.exit(0);
}
run().catch(console.dir);
