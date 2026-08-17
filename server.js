
import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import { pool, hasDatabase, migrate } from "./db/index.js";

dotenv.config();
const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename);
const app=express();
const PORT=Number(process.env.PORT||3000);
const BASE_URL=process.env.BASE_URL||`http://localhost:${PORT}`;
const ADMIN_TOKEN=process.env.ADMIN_TOKEN||"troque-este-token";
const WHATSAPP_NUMBER=process.env.WHATSAPP_NUMBER||"";
const FREE_SHIPPING_THRESHOLD=Number(process.env.FREE_SHIPPING_THRESHOLD||299);
const PRODUCTS_FILE=path.join(__dirname,"public","products.json");
const ORDERS_FILE=path.join(__dirname,"data","orders.json");
const resend=process.env.RESEND_API_KEY?new Resend(process.env.RESEND_API_KEY):null;

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

if(hasDatabase){await migrate();}

function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return fallback}}
function writeJson(file,value){const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2),"utf8");fs.renameSync(tmp,file)}

function rowToProduct(r){return {
  id:r.id,sku:r.sku,name:r.name,symbol:r.symbol,collection:r.collection,
  price:Number(r.price),stock:Number(r.stock),image:r.image,profile:r.profile,short:r.short,
  top:r.top_note,heart:r.heart_note,base:r.base_note,vessel:r.vessel,
  weight_grams:Number(r.weight_grams),
  dimensions_cm:{width:Number(r.width_cm),height:Number(r.height_cm),length:Number(r.length_cm)}
}}

async function getProducts(){
  if(pool){const {rows}=await pool.query("SELECT * FROM products WHERE active=TRUE ORDER BY id");return rows.map(rowToProduct)}
  return readJson(PRODUCTS_FILE,[]);
}
async function getProduct(id){return (await getProducts()).find(p=>p.id===id)}
async function updateProduct(id,patch){
  if(pool){
    const current=await getProduct(id);if(!current)return null;
    const stock=patch.stock!==undefined?Math.max(0,Number(patch.stock)||0):current.stock;
    const price=patch.price!==undefined?Math.max(0,Number(patch.price)||0):current.price;
    const {rows}=await pool.query("UPDATE products SET stock=$2,price=$3,updated_at=NOW() WHERE id=$1 RETURNING *",[id,stock,price]);
    return rows[0]?rowToProduct(rows[0]):null;
  }
  const ps=readJson(PRODUCTS_FILE,[]),p=ps.find(x=>x.id===id);if(!p)return null;
  if(patch.stock!==undefined)p.stock=Math.max(0,Number(patch.stock)||0);
  if(patch.price!==undefined)p.price=Math.max(0,Number(patch.price)||0);
  writeJson(PRODUCTS_FILE,ps);return p;
}

async function listOrders(){
  if(pool){const {rows}=await pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500");return rows.map(normalizeOrder)}
  return readJson(ORDERS_FILE,[]);
}
function normalizeOrder(r){return {...r,subtotal:Number(r.subtotal),total:Number(r.total)}}
async function getOrder(id){
  if(pool){const {rows}=await pool.query("SELECT * FROM orders WHERE id=$1",[id]);return rows[0]?normalizeOrder(rows[0]):null}
  return readJson(ORDERS_FILE,[]).find(o=>o.id===id)||null;
}
async function insertOrder(order){
  if(pool){
    await pool.query(`INSERT INTO orders
      (id,created_at,updated_at,status,payment_status,payment_id,preference_id,buyer,items,subtotal,shipping,total,stock_applied,email_confirmation_sent,email_paid_sent)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [order.id,order.created_at,order.updated_at,order.status,order.payment_status,order.payment_id,order.preference_id,
       order.buyer,JSON.stringify(order.items),order.subtotal,JSON.stringify(order.shipping),order.total,order.stock_applied,false,false]);
  }else{const os=readJson(ORDERS_FILE,[]);os.unshift(order);writeJson(ORDERS_FILE,os)}
}
async function patchOrder(id,patch){
  const order=await getOrder(id);if(!order)return null;
  Object.assign(order,patch,{updated_at:new Date().toISOString()});
  if(pool){
    await pool.query(`UPDATE orders SET status=$2,payment_status=$3,payment_id=$4,preference_id=$5,
      shipping=$6,total=$7,stock_applied=$8,email_confirmation_sent=$9,email_paid_sent=$10,updated_at=NOW() WHERE id=$1`,
      [id,order.status,order.payment_status,order.payment_id,order.preference_id,JSON.stringify(order.shipping),order.total,
       order.stock_applied,Boolean(order.email_confirmation_sent),Boolean(order.email_paid_sent)]);
  }else{
    const os=readJson(ORDERS_FILE,[]),i=os.findIndex(o=>o.id===id);if(i>=0){os[i]=order;writeJson(ORDERS_FILE,os)}
  }
  return order;
}
async function decrementStock(order){
  if(order.stock_applied)return order;
  if(pool){
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      for(const line of order.items){
        const result=await client.query("UPDATE products SET stock=stock-$2,updated_at=NOW() WHERE id=$1 AND stock >= $2 RETURNING stock",[line.id,line.quantity]);
        if(result.rowCount===0)throw new Error(`Estoque insuficiente para ${line.name}`);
      }
      await client.query("UPDATE orders SET stock_applied=TRUE,updated_at=NOW() WHERE id=$1",[order.id]);
      await client.query("COMMIT");order.stock_applied=true;
    }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
  }else{
    const ps=readJson(PRODUCTS_FILE,[]);
    for(const line of order.items){const p=ps.find(x=>x.id===line.id);if(p)p.stock=Math.max(0,p.stock-line.quantity)}
    writeJson(PRODUCTS_FILE,ps);order.stock_applied=true;await patchOrder(order.id,{stock_applied:true});
  }
  return order;
}
async function validateCart(cart){
  if(!Array.isArray(cart)||!cart.length)throw new Error("Carrinho vazio.");
  const map=new Map((await getProducts()).map(p=>[p.id,p]));
  return cart.map(line=>{const p=map.get(String(line.id)),q=Math.max(1,Math.min(20,Number(line.quantity)||1));
    if(!p)throw new Error("Produto inválido.");if(q>p.stock)throw new Error(`${p.name}: somente ${p.stock} unidade(s) disponível(is).`);
    return{product:p,quantity:q}});
}
function fallbackShipping(uf,subtotal){
  if(subtotal>=FREE_SHIPPING_THRESHOLD)return [{id:"free",name:"Frete grátis",company:"ELEMENTA",price:0,days:"3 a 8 dias úteis"}];
  const map={SP:[19.9,"2 a 5"],RJ:[24.9,"3 a 6"],MG:[24.9,"3 a 6"],ES:[24.9,"3 a 6"],PR:[29.9,"4 a 7"],SC:[29.9,"4 a 7"],RS:[29.9,"4 a 8"]};
  const [price,range]=map[String(uf||"").toUpperCase()]||[39.9,"5 a 12"];
  return [{id:"fallback",name:"Entrega padrão",company:"ELEMENTA",price,days:`${range} dias úteis`}];
}
async function melhorEnvioQuote(postalCode,lines){
  if(!process.env.MELHOR_ENVIO_TOKEN||!process.env.MELHOR_ENVIO_ORIGIN_CEP)return null;
  const base=String(process.env.MELHOR_ENVIO_ENV||"production")==="sandbox"?"https://sandbox.melhorenvio.com.br":"https://melhorenvio.com.br";
  const body={
    from:{postal_code:String(process.env.MELHOR_ENVIO_ORIGIN_CEP).replace(/\D/g,"")},
    to:{postal_code:String(postalCode).replace(/\D/g,"")},
    products:lines.map(({product,quantity})=>({
      id:product.sku||product.id,width:product.dimensions_cm.width,height:product.dimensions_cm.height,length:product.dimensions_cm.length,
      weight:Number(product.weight_grams)/1000,insurance_value:Number(product.price.toFixed(2)),quantity
    })),
    options:{receipt:false,own_hand:false}
  };
  const r=await fetch(`${base}/api/v2/me/shipment/calculate`,{method:"POST",headers:{
    Authorization:`Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,"Content-Type":"application/json","Accept":"application/json",
    "User-Agent":process.env.MELHOR_ENVIO_USER_AGENT||"ELEMENTA Ecommerce (contato@elementa.com.br)"
  },body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`Melhor Envio ${r.status}`);
  const data=await r.json();
  return data.filter(x=>!x.error&&x.custom_price).map(x=>({
    id:String(x.id),name:x.name||"Frete",company:x.company?.name||"",price:Number(x.custom_price),
    days:`${Number(x.custom_delivery_time||x.delivery_time)} dias úteis`
  })).sort((a,b)=>a.price-b.price);
}
async function sendEmail({to,subject,html}){
  if(!resend||!to||!process.env.EMAIL_FROM)return null;
  return resend.emails.send({from:process.env.EMAIL_FROM,to:[to],subject,html});
}
function emailOrderHtml(order,title){
  const rows=order.items.map(i=>`<tr><td>${i.quantity}× ${i.name}</td><td style="text-align:right">R$ ${(i.unit_price*i.quantity).toFixed(2).replace(".",",")}</td></tr>`).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#292b25">
    <h1 style="font-family:Georgia,serif;letter-spacing:.08em">ELEMENTA</h1><h2>${title}</h2>
    <p>Pedido <strong>${order.id}</strong></p><table style="width:100%">${rows}
    <tr><td>Frete — ${order.shipping?.name||""}</td><td style="text-align:right">R$ ${Number(order.shipping?.price||0).toFixed(2).replace(".",",")}</td></tr>
    <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>R$ ${Number(order.total).toFixed(2).replace(".",",")}</strong></td></tr></table>
    <p>Obrigado por escolher a ELEMENTA.</p></div>`;
}
async function maybeSendCreated(order){
  if(order.email_confirmation_sent)return;
  await sendEmail({to:order.buyer.email,subject:`ELEMENTA — pedido ${order.id} recebido`,html:emailOrderHtml(order,"Recebemos seu pedido")});
  if(process.env.EMAIL_ADMIN)await sendEmail({to:process.env.EMAIL_ADMIN,subject:`Novo pedido ELEMENTA ${order.id}`,html:emailOrderHtml(order,"Novo pedido")});
  await patchOrder(order.id,{email_confirmation_sent:true});
}
async function maybeSendPaid(order){
  if(order.email_paid_sent)return;
  await sendEmail({to:order.buyer.email,subject:`ELEMENTA — pagamento aprovado ${order.id}`,html:emailOrderHtml(order,"Pagamento aprovado")});
  await patchOrder(order.id,{email_paid_sent:true});
}
function adminOnly(req,res,next){if(req.headers["x-admin-token"]!==ADMIN_TOKEN)return res.status(401).json({error:"Não autorizado."});next()}
function safeOrder(o){return{id:o.id,created_at:o.created_at,updated_at:o.updated_at,status:o.status,payment_status:o.payment_status,total:o.total,subtotal:o.subtotal,shipping:o.shipping,buyer:{name:o.buyer?.name,city:o.buyer?.city,state:o.buyer?.state},items:o.items}}

app.get("/api/config",(_q,res)=>res.json({whatsapp:WHATSAPP_NUMBER,freeShippingThreshold:FREE_SHIPPING_THRESHOLD,database:hasDatabase,shippingProvider:process.env.MELHOR_ENVIO_TOKEN?"Melhor Envio":"fallback"}));
app.get("/api/products",async(_q,res)=>res.json(await getProducts()));
app.get("/api/cep/:cep",async(req,res)=>{try{const cep=String(req.params.cep).replace(/\D/g,"");if(cep.length!==8)throw new Error("CEP inválido.");
  const r=await fetch(`https://viacep.com.br/ws/${cep}/json/`),d=await r.json();if(!r.ok||d.erro)return res.status(404).json({error:"CEP não encontrado."});
  res.json({cep:d.cep,street:d.logradouro,district:d.bairro,city:d.localidade,state:d.uf})}catch(e){res.status(400).json({error:e.message})}});
app.post("/api/shipping",async(req,res)=>{try{
  const lines=await validateCart(req.body.cart),subtotal=lines.reduce((s,x)=>s+x.product.price*x.quantity,0),cep=String(req.body.zip||"").replace(/\D/g,"");
  let options=null;
  try{options=cep.length===8?await melhorEnvioQuote(cep,lines):null}catch(e){console.error("Melhor Envio:",e.message)}
  if(!options?.length)options=fallbackShipping(req.body.state,subtotal);
  res.json({subtotal,options,provider:process.env.MELHOR_ENVIO_TOKEN?"Melhor Envio/fallback":"fallback"});
}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/orders/:id",async(req,res)=>{const o=await getOrder(req.params.id);if(!o)return res.status(404).json({error:"Pedido não encontrado."});res.json(safeOrder(o))});

app.post("/api/checkout",async(req,res)=>{try{
  const lines=await validateCart(req.body.cart),buyer=req.body.buyer||{},selected=req.body.shipping||null;
  for(const k of ["name","email","phone","zip","address","number","city","state"])if(!buyer[k])throw new Error("Preencha todos os dados obrigatórios.");
  const subtotal=lines.reduce((s,x)=>s+x.product.price*x.quantity,0);
  let options=null;try{options=await melhorEnvioQuote(buyer.zip,lines)}catch(e){console.error(e.message)}
  if(!options?.length)options=fallbackShipping(buyer.state,subtotal);
  const shipping=options.find(o=>String(o.id)===String(selected?.id))||options[0];
  const total=Number((subtotal+Number(shipping.price)).toFixed(2)),id=`ELM-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const order={id,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),status:"awaiting_payment",payment_status:"not_started",payment_id:null,preference_id:null,
    stock_applied:false,email_confirmation_sent:false,email_paid_sent:false,buyer,items:lines.map(({product,quantity})=>({id:product.id,sku:product.sku,name:product.name,quantity,unit_price:product.price,image:product.image})),
    subtotal,shipping,total};
  await insertOrder(order);await maybeSendCreated(order);
  if(!process.env.MERCADO_PAGO_ACCESS_TOKEN)return res.json({mode:"demo",orderId:id,message:"Pedido criado em modo demonstração. Nenhuma cobrança foi realizada."});
  const items=lines.map(({product,quantity})=>({id:product.id,title:`ELEMENTA ${product.name}`,description:`${product.collection} · ${product.profile}`,picture_url:`${BASE_URL}${product.image}`,category_id:"home",quantity,currency_id:"BRL",unit_price:product.price}));
  if(Number(shipping.price)>0)items.push({id:"shipping",title:`Frete ${shipping.name}`,quantity:1,currency_id:"BRL",unit_price:Number(shipping.price)});
  const pref={items,external_reference:id,payer:{name:buyer.name,email:buyer.email,phone:{number:buyer.phone}},
    back_urls:{success:`${BASE_URL}/?status=success&order=${encodeURIComponent(id)}`,pending:`${BASE_URL}/?status=pending&order=${encodeURIComponent(id)}`,failure:`${BASE_URL}/?status=failure&order=${encodeURIComponent(id)}`},
    auto_return:"approved",notification_url:`${BASE_URL}/api/webhooks/mercadopago`,statement_descriptor:"ELEMENTA",metadata:{brand:"ELEMENTA",order_id:id}};
  const r=await fetch("https://api.mercadopago.com/checkout/preferences",{method:"POST",headers:{Authorization:`Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,"Content-Type":"application/json","X-Idempotency-Key":crypto.randomUUID()},body:JSON.stringify(pref)});
  const d=await r.json();if(!r.ok){await patchOrder(id,{status:"payment_error"});throw new Error("Falha ao criar pagamento.")}
  await patchOrder(id,{preference_id:d.id,payment_status:"preference_created"});res.json({mode:"mercadopago",orderId:id,redirectUrl:d.init_point||d.sandbox_init_point});
}catch(e){res.status(400).json({error:e.message})}});

app.post("/api/webhooks/mercadopago",async(req,res)=>{res.sendStatus(200);try{
  if(!process.env.MERCADO_PAGO_ACCESS_TOKEN)return;const paymentId=req.body?.data?.id||req.query?.["data.id"]||req.query?.id;if(!paymentId)return;
  const r=await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`,{headers:{Authorization:`Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`}});
  if(!r.ok)return;const p=await r.json(),id=p.external_reference||p.metadata?.order_id;if(!id)return;let o=await getOrder(id);if(!o)return;
  const status=p.status==="approved"?"paid":p.status==="rejected"?"payment_rejected":p.status==="cancelled"?"cancelled":"payment_pending";
  o=await patchOrder(id,{payment_id:String(p.id),payment_status:p.status||"unknown",status});
  if(p.status==="approved"){o=await decrementStock(o);await maybeSendPaid(o)}
}catch(e){console.error("Webhook:",e)}});

app.get("/api/admin/orders",adminOnly,async(_q,res)=>res.json(await listOrders()));
app.get("/api/admin/products",adminOnly,async(_q,res)=>res.json(await getProducts()));
app.patch("/api/admin/products/:id",adminOnly,async(req,res)=>{const p=await updateProduct(req.params.id,req.body);if(!p)return res.status(404).json({error:"Produto não encontrado."});res.json(p)});
app.patch("/api/admin/orders/:id",adminOnly,async(req,res)=>{const allowed=["processing","shipped","delivered","cancelled"];if(!allowed.includes(req.body.status))return res.status(400).json({error:"Status inválido."});
  const o=await patchOrder(req.params.id,{status:req.body.status});if(!o)return res.status(404).json({error:"Pedido não encontrado."});res.json(o)});

app.listen(PORT,()=>console.log(`ELEMENTA v3 em ${BASE_URL} | DB: ${hasDatabase?"PostgreSQL":"JSON fallback"}`));
