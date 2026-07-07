import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DB_PATH = path.join(ROOT, "data", "tausta.db");
const SCHEMA_PATH = path.join(ROOT, "scripts", "db", "schema.sql");

export function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);
  for (const sql of [
    "ALTER TABLE ticker_results ADD COLUMN market_cap REAL",
    "ALTER TABLE ticker_results ADD COLUMN p_fcf REAL",
    "ALTER TABLE ticker_results ADD COLUMN week52_off_pct REAL",
  ]) {
    try {
      db.exec(sql);
    } catch {
      // column already exists
    }
  }
  return db;
}

export { DB_PATH, ROOT };
