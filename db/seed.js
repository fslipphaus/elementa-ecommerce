
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { migrate, pool } from "./index.js";
const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename);
if(!pool){console.log("DATABASE_URL não configurada.");process.exit(0)}
await migrate();
const products=JSON.parse(fs.readFileSync(path.join(__dirname,"..","public","products.json"),"utf8"));
for(const p of products){
  await pool.query(`
    INSERT INTO products
    (id,sku,name,symbol,collection,price,stock,image,profile,short,top_note,heart_note,base_note,vessel,weight_grams,width_cm,height_cm,length_cm)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT(id) DO UPDATE SET
      sku=EXCLUDED.sku,name=EXCLUDED.name,symbol=EXCLUDED.symbol,collection=EXCLUDED.collection,
      price=EXCLUDED.price,stock=EXCLUDED.stock,image=EXCLUDED.image,profile=EXCLUDED.profile,short=EXCLUDED.short,
      top_note=EXCLUDED.top_note,heart_note=EXCLUDED.heart_note,base_note=EXCLUDED.base_note,vessel=EXCLUDED.vessel,
      weight_grams=EXCLUDED.weight_grams,width_cm=EXCLUDED.width_cm,height_cm=EXCLUDED.height_cm,length_cm=EXCLUDED.length_cm,
      updated_at=NOW()
  `,[p.id,p.sku,p.name,p.symbol,p.collection,p.price,p.stock,p.image,p.profile,p.short,p.top,p.heart,p.base,p.vessel,
      p.weight_grams,p.dimensions_cm.width,p.dimensions_cm.height,p.dimensions_cm.length]);
}
console.log("Produtos carregados no PostgreSQL.");
await pool.end();
