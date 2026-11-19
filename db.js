// Database connection. Exports one object with the same small interface for both databases:
//   query(sql, params) -> { rows, rowCount }   (placeholders $1, $2, ... keep input separate from SQL)
//   exec(sql)          -> run a script, init() -> create tables and add starting records once
//
// (server.js loads .env before this file.)
// DATABASE_URL set   -> PostgreSQL through the pg connection pool (use this when hosted, so records survive restarts)
// DATABASE_URL empty -> a local SQLite file (zero setup for local testing; temporary on free hosting)
const fs = require("fs");
const path = require("path");

function createPostgres(url) {
  const { Pool } = require("pg");
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  const ssl = process.env.DATABASE_SSL === "false" || isLocal ? false : { rejectUnauthorized: false };
  // The ssl option above decides about encryption, so remove any sslmode=... that was copied into the URL
  // (otherwise the pg package would insist on a fully verified certificate and fail on hosted databases).
  const cleanUrl = url.replace(/([?&])sslmode=[^&]*&?/i, "$1").replace(/[?&]$/, "");
  const pool = new Pool({ connectionString: cleanUrl, ssl });
  pool.on("error", (error) => console.error("Database pool error:", error.message));
  return {
    engine: "PostgreSQL",
    query: (sql, params = []) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),
    close: () => pool.end(),
  };
}

function createSqlite(file) {
  const { DatabaseSync } = require("node:sqlite"); // built into Node.js 22.13 and newer
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  return {
    engine: "SQLite",
    async query(sql, params = []) {
      const rows = db.prepare(sql.replace(/\$(\d+)/g, "?$1")).all(...params).map((row) => ({ ...row }));
      return { rows, rowCount: rows.length };
    },
    async exec(sql) {
      db.exec(sql.replace(/SERIAL PRIMARY KEY/gi, "INTEGER PRIMARY KEY AUTOINCREMENT"));
    },
    async close() { db.close(); },
  };
}

const databaseUrl = (process.env.DATABASE_URL || "").trim();
const sqliteFile = process.env.SQLITE_FILE || path.join(__dirname, "data", "records.db");
const pool = databaseUrl ? createPostgres(databaseUrl) : createSqlite(sqliteFile);

pool.init = async function init() {
  await pool.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  const done = await pool.query("SELECT setting_value FROM app_meta WHERE setting_key = $1", ["seeded"]);
  if (done.rows.length === 0) {
    await pool.exec(fs.readFileSync(path.join(__dirname, "seed.sql"), "utf8"));
    await pool.query("INSERT INTO app_meta (setting_key, setting_value) VALUES ($1, $2)", ["seeded", "yes"]);
    console.log("Starting records inserted.");
  }
};

module.exports = pool;
