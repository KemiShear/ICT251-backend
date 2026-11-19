// The five record routes, mounted at /api/records in server.js.
const router = require("express").Router();
const pool = require("../db");

const STATUSES = ["Pending", "In progress", "Completed"];
const RULES = { title: [3, 80, "Title"], category: [2, 40, "Category"], description: [5, 300, "Description"] };
const COLUMNS = "id, title, category, description, status";
const MAX_ID = 2147483647; // largest id the database can hold

const notFound = (res, id) => res.status(404).json({ message: `Record ${id} was not found.` });

// Returns the id as a number, or null after sending a 400 / 404 response.
function readId(req, res) {
  const raw = req.params.id;
  if (!/^[1-9][0-9]*$/.test(raw)) {
    res.status(400).json({ message: "The id must be a positive whole number." });
    return null;
  }
  if (Number(raw) > MAX_ID) {
    notFound(res, raw);
    return null;
  }
  return Number(raw);
}

// Checks the four editable fields. Returns { values } or { error }. A client-supplied id is never read.
function checkBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Send a JSON object with title, category, description and status (Content-Type: application/json)." };
  }
  const values = {};
  for (const [field, [min, max, label]] of Object.entries(RULES)) {
    const raw = body[field];
    if (raw === undefined || raw === null) return { error: `${label} is required.` };
    if (typeof raw !== "string") return { error: `${label} must be a string.` };
    const text = raw.trim();
    if (text.length < min || text.length > max) return { error: `${label} must have ${min} to ${max} characters.` };
    values[field] = text;
  }
  if (body.status === undefined || body.status === null) return { error: "Status is required." };
  if (typeof body.status !== "string") return { error: "Status must be a string." };
  if (!STATUSES.includes(body.status)) return { error: `Status must be one of: ${STATUSES.join(", ")}.` };
  values.status = body.status;
  return { values };
}

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT ${COLUMNS} FROM records ORDER BY id`);
    res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = readId(req, res);
    if (id === null) return;
    const result = await pool.query(`SELECT ${COLUMNS} FROM records WHERE id = $1`, [id]);
    if (result.rows.length === 0) return notFound(res, id);
    res.status(200).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { values, error } = checkBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const result = await pool.query(
      `INSERT INTO records (title, category, description, status) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
      [values.title, values.category, values.description, values.status]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = readId(req, res);
    if (id === null) return;
    const { values, error } = checkBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const result = await pool.query(
      `UPDATE records SET title = $1, category = $2, description = $3, status = $4 WHERE id = $5 RETURNING ${COLUMNS}`,
      [values.title, values.category, values.description, values.status, id]
    );
    if (result.rows.length === 0) return notFound(res, id);
    res.status(200).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = readId(req, res);
    if (id === null) return;
    const result = await pool.query("DELETE FROM records WHERE id = $1 RETURNING id", [id]);
    if (result.rows.length === 0) return notFound(res, id);
    res.status(200).json({ message: "Record deleted." });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
