
import "dotenv/config";
import { migrate, pool } from "./index.js";
if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL não configurada. Migração ignorada.");
  process.exit(0);
}
await migrate();
console.log("Migração PostgreSQL concluída.");
await pool.end();
