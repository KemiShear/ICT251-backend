// Runs the lecturer's backend tests against a running server (local or hosted).
//   npm test                                  -> http://localhost:3000
//   npm test -- https://your-backend.onrender.com
// It creates and deletes its own record and leaves your other records untouched.
const base = (process.argv[2] || process.env.API_URL || "http://localhost:3000").replace(/\/+$/, "");
const good = { title: "Test: broken tap", category: "Plumbing", description: "Tap in Room T1 will not close.", status: "Pending" };
let failures = 0;

const call = async (method, path, body, raw) => {
  const options = { method, headers: {} };
  if (body !== undefined) { options.headers["Content-Type"] = "application/json"; options.body = raw ? body : JSON.stringify(body); }
  const res = await fetch(base + path, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
};
const check = (name, condition, detail = "") => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : "  " + detail}`);
  if (!condition) failures++;
};

(async () => {
  console.log(`Testing ${base}\n`);
  let r = await call("GET", "/");
  check("GET / returns the HTML guide", r.status === 200 && r.text.includes("202502752") && r.text.includes("/api/records/:id"));
  r = await call("GET", "/health");
  check("GET /health is 200", r.status === 200 && r.json.status === "ok", JSON.stringify(r.json));
  r = await call("GET", "/api/records");
  check("GET /api/records is 200 and an array", r.status === 200 && Array.isArray(r.json));
  const before = r.json.length;
  check("at least eight starting records exist", before >= 8 || before === 0, `found ${before}`);

  r = await call("POST", "/api/records", { ...good, id: 999999 });
  const id = r.json && r.json.id;
  check("POST valid body is 201 with a new id (client id ignored)", r.status === 201 && Number.isInteger(id) && id !== 999999 && r.json.title === good.title, JSON.stringify(r.json));
  r = await call("GET", `/api/records/${id}`);
  check("GET one returns the exact record", r.status === 200 && JSON.stringify(r.json) === JSON.stringify({ id, ...good }), JSON.stringify(r.json));
  const changed = { title: "  Test: tap fixed  ", category: "Plumbing", description: "Washer replaced in Room T1.", status: "Completed" };
  r = await call("PUT", `/api/records/${id}`, changed);
  check("PUT returns changed values, original id, trimmed text", r.status === 200 && r.json.id === id && r.json.title === "Test: tap fixed" && r.json.status === "Completed", JSON.stringify(r.json));
  r = await call("DELETE", `/api/records/${id}`);
  check("DELETE returns the deletion message", r.status === 200 && r.json.message === "Record deleted.");
  r = await call("GET", `/api/records/${id}`);
  check("GET deleted id is 404", r.status === 404 && typeof r.json.message === "string");

  const bad = [
    ["missing title", { ...good, title: undefined }],
    ["spaces-only title", { ...good, title: "     " }],
    ["title too short", { ...good, title: "ab" }],
    ["title too long", { ...good, title: "x".repeat(81) }],
    ["category too short", { ...good, category: "E" }],
    ["description too short", { ...good, description: "abcd" }],
    ["description too long", { ...good, description: "x".repeat(301) }],
    ["invalid status", { ...good, status: "Done" }],
    ["status wrong case", { ...good, status: "pending" }],
    ["title not a string", { ...good, title: 12345 }],
  ];
  for (const [name, body] of bad) {
    r = await call("POST", "/api/records", body);
    check(`POST ${name} is 400 with a message`, r.status === 400 && typeof r.json.message === "string", `${r.status} ${r.text}`);
  }
  r = await call("POST", "/api/records", "{ not json", true);
  check("POST malformed JSON is 400 with JSON message", r.status === 400 && typeof r.json.message === "string", `${r.status} ${r.text}`);
  r = await call("GET", "/api/records");
  check("no rows were created by the bad requests", r.json.length === before, `${r.json.length} vs ${before}`);

  for (const badId of ["abc", "0", "-5", "1.5"]) {
    r = await call("GET", `/api/records/${badId}`);
    check(`GET invalid id "${badId}" is 400`, r.status === 400 && typeof r.json.message === "string", `${r.status}`);
  }
  r = await call("PUT", "/api/records/abc", good);
  check("PUT invalid id is 400", r.status === 400);
  r = await call("DELETE", "/api/records/abc");
  check("DELETE invalid id is 400", r.status === 400);

  for (const missing of ["999999", "99999999999"]) {
    r = await call("GET", `/api/records/${missing}`);
    check(`GET missing id ${missing} is 404`, r.status === 404 && typeof r.json.message === "string");
    r = await call("PUT", `/api/records/${missing}`, good);
    check(`PUT missing id ${missing} is 404 and creates nothing`, r.status === 404);
    r = await call("DELETE", `/api/records/${missing}`);
    check(`DELETE missing id ${missing} is 404`, r.status === 404);
  }
  r = await call("GET", "/api/records");
  check("PUT did not create a record", r.json.length === before);
  r = await call("GET", "/nothing-here");
  check("unknown route is 404 JSON", r.status === 404 && typeof r.json.message === "string");

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((error) => { console.error(`Could not reach ${base}: ${error.message}`); process.exit(1); });
