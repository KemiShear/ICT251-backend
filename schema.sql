-- Creates the tables. Safe to run many times (IF NOT EXISTS).
-- Written for PostgreSQL; db.js translates SERIAL for SQLite when it is used locally.

CREATE TABLE IF NOT EXISTS records (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('Pending', 'In progress', 'Completed'))
);

-- Remembers that the starting records were inserted, so they are added only once.
CREATE TABLE IF NOT EXISTS app_meta (
  setting_key   TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);
