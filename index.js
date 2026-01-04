const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;
// Middleware
app.use(cors());
app.use(express.json());

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
    // await client.connect();
    const db = client.db("export_import-db");
    const products = () => db.collection("export_import");
    const imports = () => db.collection("imports");
    const exports = () => db.collection("exports");

    app.get("/products", async (req, res) => {
      try {
        const {
          search,
          category,
          priceMax,
          ratingMin,
          sort,
          page = 1,
          limit = 9,
        } = req.query;

        let query = {};

        if (search) {
          query.name = { $regex: search, $options: "i" };
        }

        if (category) {
          query.category = { $regex: category, $options: "i" };
        }

        if (priceMax) {
          query.price = { $lte: Number(priceMax) };
        }

        if (ratingMin) {
          query.rating = { $gte: Number(ratingMin) };
        }

        let sortObj = {};
        if (sort === "price-asc") sortObj.price = 1;
        else if (sort === "price-desc") sortObj.price = -1;
        else if (sort === "rating-desc") sortObj.rating = -1;

        const skip = (Number(page) - 1) * Number(limit);

        const collection = products();

        const total = await collection.countDocuments(query);
        const list = await collection
          .find(query)
          .sort(sortObj)
          .skip(skip)
          .limit(Number(limit))
          .toArray();

        res.json({
          products: list,
          totalPages: Math.ceil(total / limit),
          currentPage: Number(page),
          total,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch products" });
      }
    });

    app.get("/search", async (req, res) => {
      const search_text = req.query.search || "";
      const result = await products
        .find({ name: { $regex: search_text, $options: "i" } })
        .toArray();
      res.json(result);
    });

    app.get("/latest-products", async (req, res) => {
      try {
        const result = await products()
          .find()
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        res.json(result);
      } catch (error) {
        console.error("Latest products error:", error);
        res.status(500).json({ error: "Failed to load latest products" });
      }
    });

    //get product ID
    app.get("/products/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid product ID" });
        }

        const result = await products().findOne({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res.status(404).json({ error: "Product not found" });
        }

        res.json(result);
      } catch (err) {
        console.error("Product fetch error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
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

    app.post("/import/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { email, importedQuantity } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid product ID" });
        }

        const quantity = Number(importedQuantity);

        if (!email || !quantity || quantity <= 0) {
          return res.status(400).json({ error: "Invalid import data" });
        }

        const product = await products().findOne({
          _id: new ObjectId(id),
        });

        if (!product) {
          return res.status(404).json({ error: "Product not found" });
        }

        if (quantity > product.available_quantity) {
          return res.status(400).json({
            error: `Only ${product.available_quantity} items available`,
          });
        }

        // import record
        const importDoc = {
          productId: id,
          importedQuantity: quantity,
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
          { $inc: { available_quantity: -quantity } }
        );

        res.json({ success: true, importId: r.insertedId });
      } catch (error) {
        console.error("Import error:", error);
        res.status(500).json({ error: "Failed to process import" });
      }
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

    // PUT update product
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

    // GET /dashboard-stats
    app.get("/dashboard-stats", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).json({ error: "email required" });

      try {
        // Total Exports
        const exportsList = await exports().find({ addedBy: email }).toArray();
        const totalExports = exportsList.length;

        // Total Imports
        const importsList = await imports()
          .find({ imported_by: email })
          .toArray();
        const totalImports = importsList.length;

        const balance =
          exportsList.reduce((acc, ex) => acc + (ex.price || 0), 0) -
          importsList.reduce(
            (acc, imp) =>
              acc + imp.importedQuantity * (imp.productSnapshot.price || 0),
            0
          );

        // Chart Data
        const chartData = [
          { name: "Exports", value: totalExports },
          { name: "Imports", value: totalImports },
        ];

        // Recent Trades (latest 5)
        const recentTrades = await imports()
          .find({ imported_by: email })
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray();

        res.json({
          stats: { exports: totalExports, imports: totalImports, balance },
          chartData,
          recentTrades,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
      }
    });

    // Connection Test;
    console.log(" Ping successful — MongoDB is live!");
  } catch (error) {
    console.error(" Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(port, () => {
  console.log(` Server is listening on port ${port}`);
});
