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

    app.get("/product/:id", async (req, res) => {
      const { id } = req.params;
      const result = await productCollection.findOne({ _id: new ObjectId(id) });

      if (!result) {
        // Return a 404 status and an empty JSON object when product is not found
        return res.status(404).send({});
      }

      res.send(result);
    });

    app.post("/import", async (req, res) => {
     
      const data = req.body;
      const { productId, importedQuantity } = data;

      if (!productId || !importedQuantity || importedQuantity <= 0) {
        return res.status(400).send({
          success: false,
          message: "Invalid product or quantity specified.",
        });
      }

      const importData = {
        ...data,
        productId: new ObjectId(productId),
        quantity: importedQuantity,
        downloaded_at: new Date(),
      };
      const result = await importCollection.insertOne(importData);

      const filter = { _id: new ObjectId(productId) };
      const update = {
        $inc: {
          available_quantity: -Math.abs(importedQuantity),

          downloads: Math.abs(importedQuantity),
        },
      };
      const updatedProduct = await productCollection.updateOne(filter, update);

      res.send({
        success: true,
        result,
        updatedProduct,
      });
    });

    //  Update Product
    // app.put("/product/:id", async (req, res) => {
    //   const { id } = req.params;
    //   const data = req.body;
    //   const filter = { _id: new ObjectId(id) };
    //   const update = { $set: data };
    //   const result = await productCollection.updateOne(filter, update);
    //   res.send({
    //     success: true,
    //     result,
    //   });
    // });

    app.put("/product/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = req.body;

        // ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid product ID" });
        }

        const result = await productCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Product not found" });
        }

        res.json({ success: true, message: "Product updated successfully" });
      } catch (error) {
        console.error("Update product error:", error);
        res
          .status(500)
          .json({ message: "Server error while updating product" });
      }
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

    // Import Product
    app.post("/imports/:id", async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      const { quantity } = data;

      const importData = {
        ...data,
        productId: new ObjectId(id),
        quantity: quantity || 1,
      };
    
      const result = await importCollection.insertOne(importData);

      const filter = { _id: new ObjectId(id) };
      const update = {
        $inc: {
     
          available_quantity: -Math.abs(quantity),
         
          downloads: Math.abs(quantity),
        },
      };
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
