
const brl=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});const $=s=>document.querySelector(s);
let token=sessionStorage.getItem("elementa_admin_token")||"";$("#token").value=token;
const headers=()=>({"X-Admin-Token":token,"Content-Type":"application/json"});
$("#login").onclick=()=>{token=$("#token").value.trim();sessionStorage.setItem("elementa_admin_token",token);load()};
async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{...headers(),...(opt.headers||{})}});const d=await r.json();if(!r.ok)throw new Error(d.error||"Erro");return d}
async function load(){
 try{
  const [products,orders]=await Promise.all([api("/api/admin/products"),api("/api/admin/orders")]);
  $("#adminMessage").innerHTML="";
  $("#adminProducts").innerHTML=products.map(p=>`<div class="admin-product"><img src="${p.image}"><div><b>${p.name}</b><br><small>${p.sku}</small></div><input type="number" min="0" value="${p.stock}" data-stock="${p.id}"><input type="number" min="0" step=".01" value="${p.price}" data-price="${p.id}"></div>`).join("");
  document.querySelectorAll("[data-stock]").forEach(el=>el.onchange=()=>saveProduct(el.dataset.stock,{stock:Number(el.value)}));
  document.querySelectorAll("[data-price]").forEach(el=>el.onchange=()=>saveProduct(el.dataset.price,{price:Number(el.value)}));
  $("#adminOrders").innerHTML=orders.length?orders.map(o=>`<article class="order"><div class="order-top"><div><b>${o.id}</b><br><small>${new Date(o.created_at).toLocaleString("pt-BR")} · ${o.buyer?.name||""}</small></div><strong>${brl.format(o.total)}</strong></div><div class="order-items">${o.items.map(i=>`${i.quantity}× ${i.name}`).join(" · ")}</div><small>Pagamento: ${o.payment_status} · ${o.buyer?.city||""}/${o.buyer?.state||""}</small><br><select data-order="${o.id}"><option value="${o.status}">${o.status}</option><option value="processing">processing</option><option value="shipped">shipped</option><option value="delivered">delivered</option><option value="cancelled">cancelled</option></select></article>`).join(""):'<p>Nenhum pedido ainda.</p>';
  document.querySelectorAll("[data-order]").forEach(el=>el.onchange=()=>saveOrder(el.dataset.order,el.value));
 }catch(e){$("#adminMessage").innerHTML=`<p style="color:#a03d33">${e.message}. Informe o ADMIN_TOKEN configurado no .env.</p>`}
}
async function saveProduct(id,body){try{await api(`/api/admin/products/${id}`,{method:"PATCH",body:JSON.stringify(body)})}catch(e){alert(e.message)}}
async function saveOrder(id,status){try{await api(`/api/admin/orders/${id}`,{method:"PATCH",body:JSON.stringify({status})})}catch(e){alert(e.message)}}
if(token)load();
