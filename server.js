require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const renderGuide = require("./guide");

const app = express();
app.set("trust proxy", 1); // hosts such as Render sit behind a proxy; this keeps the https address correct

const origins = (process.env.CLIENT_ORIGINS || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "20kb" }));

// GET / : API guide for the marker
app.get("/", (req, res) => {
  const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  res.status(200).type("html").send(renderGuide(baseUrl.replace(/\/+$/, ""), pool.engine));
});

// GET /health : checks that the server and database respond
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", database: "connected", engine: pool.engine });
  } catch (error) {
    console.error("Health check failed:", error.message);
    res.status(503).json({ status: "error", message: "The database is not responding." });
  }
});

app.use("/api/records", require("./routes/records"));

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} does not exist.` });
});

// Error handler (four parameters): malformed JSON is 400, anything unexpected is 500
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "The request body is not valid JSON." });
  }
  if (error.type === "entity.too.large") {
    return res.status(400).json({ message: "The request body is too large." });
  }
  console.error("Unexpected error:", error);
  res.status(500).json({ message: "Something went wrong on the server. Please try again." });
});

const port = process.env.PORT || 3000;
pool.init()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server listening on port ${port} using ${pool.engine}`);
    });
  })
  .catch((error) => {
    console.error("Could not set up the database:", error.message);
    process.exit(1);
  });
