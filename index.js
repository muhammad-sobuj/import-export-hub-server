const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const admin = require("firebase-admin");
const serviceAccount = require("./export-import-hub-firebase-admin-keys.json");
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());


 admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});



// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.dzvjfpc.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Main Function
async function run() {
  try {
    await client.connect();
    const db = client.db("export_import-db");
    const productCollection = db.collection("export_import");
    const importCollection = db.collection("import");

    console.log(" MongoDB Connected Successfully!");

    //  CRUD Operations

    // Get All Products
    app.get("/products", async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    });

    // Get Latest 6 Products
    app.get("/latest-products", async (req, res) => {
      const result = await productCollection
        .find()
        .sort({ created_at: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    //  Get My Products (by email)
    app.get("/my-products", async (req, res) => {
      const email = req.query.email;
      const result = await productCollection
        .find({ created_by: email })
        .toArray();
      res.send(result);
    });

    //  Get Single Product by ID
    app.get("/product/:id", async (req, res) => {
      const { id } = req.params;
      const result = await productCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    //  Create New Product
    app.post("/product", async (req, res) => {
      const data = req.body;
      const result = await productCollection.insertOne(data);
      res.send({
        success: true,
        result,
      });
    });


    //  Update Product
    app.put("/product/:id", async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const update = { $set: data };
      const result = await productCollection.updateOne(filter, update);
      res.send({
        success: true,
        result,
      });
    });

    //  Delete Product
    app.delete("/product/:id", async (req, res) => {
      const { id } = req.params;
      const result = await productCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send({
        success: true,
        result,
      });
    });

    // Search Products
    app.get("/search", async (req, res) => {
      const search_text = req.query.search || "";
      const result = await productCollection
        .find({ name: { $regex: search_text, $options: "i" } })
        .toArray();
      res.send(result);
    });

    //  Import (like download tracking)
    app.post("/imports/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;

      // insert into imports collection
      const result = await importCollection.insertOne(data);

      // increment "downloads" count
      const filter = { _id: new ObjectId(id) };
      const update = { $inc: { downloads: 1 } };
      const updatedProduct = await productCollection.updateOne(filter, update);

      res.send({
        success: true,
        result,
        updatedProduct,
      });
    });

    //  Get My Imports
    app.get("/my-imports", async (req, res) => {
      const email = req.query.email;
      const result = await importCollection
        .find({ downloaded_by: email })
        .toArray();
      res.send(result);
    });

    // check 
//     app.get("/imports/check/:id", async (req, res) => {
//   const { id } = req.params;
//   const { email } = req.query;

//   try {
//     const existing = await import.findOne({ productId: id, downloaded_by: email });
//     res.json({ exists: !!existing });
//   } catch (error) {
//     console.error("Check import error:", error);
//     res.status(500).json({ exists: false, error: "Server error" });
//   }
// });

    // Connection Test
    await client.db("admin").command({ ping: 1 });
    console.log(" Ping successful — MongoDB is live!");
  } catch (error) {
    console.error(" Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

//  Root Route

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

//  Start Server

app.listen(port, () => {
  console.log(` Server is listening on port ${port}`);
});
