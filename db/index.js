
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const pool = hasDatabase ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: String(process.env.DATABASE_SSL).toLowerCase() === "true" ? { rejectUnauthorized:false } : false
}) : null;

export async function migrate() {
  if (!pool) return false;
  const sql = fs.readFileSync(path.join(__dirname,"schema.sql"),"utf8");
  await pool.query(sql);
  return true;
}
