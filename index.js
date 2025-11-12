const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 3000;

// index.js
const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

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
    const products = () => db.collection("export_import");
    const imports = () => db.collection("imports");
    const exports =()=> db.collection("exports");


    // GET all products
    app.get("/products", async (req, res) => {
      const list = await products().find({}).toArray();
      res.json(list);
    });

    // Search Products
    app.get("/search", async (req, res) => {
      const search_text = req.query.search || "";
      try {
        const result = await products()
          .find({ name: { $regex: search_text, $options: "i" } })
          .toArray();
        res.json(result);
      } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: "Failed to search products" });
      }
    });

    // Get Latest 6 Products
    app.get("/latest-products", async (req, res) => {
      const result = await products()
        .find()
        .sort({ created_at: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // GET product by id
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const p = await products().findOne({ _id: new ObjectId(id) });
      res.json(p);
    });

    // POST add product
    app.post("/products", async (req, res) => {
      const body = req.body;
      const result = await products().insertOne(body);
      res.json({ insertedId: result.insertedId });
    });

    // PATCH update product
    app.patch("/products/:id", async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const update = { $set: body };
      const result = await products().updateOne(
        { _id: new ObjectId(id) },
        update
      );
      res.json(result);
    });

    // DELETE product
    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      await products().deleteOne({ _id: new ObjectId(id) });
      res.json({ deleted: true });
    });

    // POST import
    app.post("/import/:id", async (req, res) => {
      const id = req.params.id;
      const { email, importedQuantity } = req.body; 

      
      const product = await products().findOne({ _id: new ObjectId(id) });
      if (!product) return res.status(404).json({ error: "Product not found" });
      if (importedQuantity > product.availableQuantity) {
        return res
          .status(400)
          .json({ error: "Import quantity exceeds available quantity" });
      }

      // import record
      const importDoc = {
        productId: id,
        importedQuantity,
        imported_by: email,
        createdAt: new Date(),
        productSnapshot: {
          name: product.name,
          price: product.price,
          image: product.image,
          originCountry: product.origin_country,
          rating: product.rating,
        },
      };
      const r = await imports().insertOne(importDoc);

     
      await products().updateOne(
        { _id: new ObjectId(id) },
        { $inc: { availableQuantity: -importedQuantity } }
      );

      res.json({ success: true, importId: r.insertedId });
    });

    // GET imports email
    app.get("/imports", async (req, res) => {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "email required" });
      const list = await imports().find({ imported_by: email }).toArray();
      res.json(list);
    });

    // DELETE import
    app.delete("/imports/:id", async (req, res) => {
      const id = req.params.id;
      await imports().deleteOne({ _id: new ObjectId(id) });
      res.json({ deleted: true });
    });

    // GET exports
  
app.get("/exports", async (req, res) => {
  const email = req.query.email;

  try {
  const result = await exports().find({ addedBy: email }).toArray();
    res.json(result);
  } catch (error) {
    console.error("Error fetching exports:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

    //  POST add product
    app.post("/exports", async (req, res) => {
      const product = req.body;
      try {
        const result = await exports().insertOne(product);
        res.json(result);
      } catch (error) {
        console.error("Add export error:", error);
        res.status(500).json({ error: "Failed to add export" });
      }
    });

    // 🟡 PUT update product
    app.put("/exports/:id", async (req, res) => {
      const { id } = req.params;
      const updateData = req.body;
      try {
        const result = await exports().updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );
        res.json(result);
      } catch (error) {
        console.error("Update export error:", error);
        res.status(500).json({ error: "Failed to update export" });
      }
    });

    //  DELETE remove product
    app.delete("/exports/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await exports().deleteOne({
          _id: new ObjectId(id),
        });
        res.json(result);
      } catch (error) {
        console.error("Delete export error:", error);
        res.status(500).json({ error: "Failed to delete export" });
      }
    });

    // Connection Test
    // await client.db("admin").command({ ping: 1 });
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
