const { MongoClient } = require('mongodb');

async function run() {
  const uri = "mongodb+srv://krrishmakewithus_db_user:VM3Hih7Nj65PDhIn@aupulens-erp.uchpvpd.mongodb.net/?retryWrites=true&w=majority";
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    family: 4
  });

  try {
    await client.connect();
    console.log("Connected successfully to server with family: 4");
  } catch (err) {
    console.error("Connection failed!");
    console.error(err);
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
