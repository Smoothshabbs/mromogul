/* MRO Mogul storefront: accounts, gated prices, listings, cart, official quotations. */
(function(){
"use strict";
var STATIC=__STATIC__, CATS=__CATS__, WA="919884064464";
var $=function(s,r){return (r||document).querySelector(s)}, $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
var num=function(v){var n=parseFloat(String(v==null?"":v).replace(/[^0-9.\-]/g,""));return isNaN(n)?0:n};
var money=function(n){return "₹"+Number(n).toLocaleString("en-IN",{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})};
var BASE=(function(){var c=document.currentScript;return c&&c.src?c.src.replace(/assets\/app\.js.*$/,""):"/"})();
var LOCAL=location.protocol==="file:";
function U(p){p=String(p).replace(/^\//,"");var q="",i=p.search(/[?#]/);if(i>-1){q=p.slice(i);p=p.slice(0,i)}if(LOCAL&&(p===""||/\/$/.test(p)))p+="index.html";return BASE+p+q}
function api(p,opt){return fetch(BASE+"api/"+p,Object.assign({credentials:"same-origin",headers:{"Content-Type":"application/json"}},opt||{}))}
function loadScript(src){return new Promise(function(res,rej){var s=document.createElement("script");s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
var tt;function toast(m,link){var t=$("#toast");if(!t)return;t.innerHTML=esc(m)+(link?' <a href="'+link[1]+'">'+esc(link[0])+'</a>':"");t.classList.add("show");clearTimeout(tt);tt=setTimeout(function(){t.classList.remove("show")},3400)}

/* ---------- state ---------- */
var USER=null, ROWS=[], BYSKU={}, BYPID={}, SIGNED=false;
var CART={}; try{CART=JSON.parse(localStorage.getItem("mm-cart")||"{}")||{}}catch(e){}
function saveCart(){try{localStorage.setItem("mm-cart",JSON.stringify(CART))}catch(e){}badge()}
function badge(){var n=0;for(var k in CART)n+=CART[k];$$(".ccount").forEach(function(b){b.textContent=n})}
function index(rows){ROWS=rows;BYSKU={};BYPID={};rows.forEach(function(r){r.price=num(r.price);r.gstInc=/^y/i.test(r.gst_included);r.gst=num(r.gst_rate)||18;r.minq=Math.max(1,parseInt(r.min_order_qty,10)||1);BYSKU[r.sku]=r;(BYPID[r.product_id]=BYPID[r.product_id]||[]).push(r)});
  Object.keys(BYPID).forEach(function(k){BYPID[k].sort(function(a,b){return num(a.sort_order)-num(b.sort_order)})})}
function boot(){
  if(LOCAL) return loadScript(U("/assets/catalog-data.js")).then(function(){index(window.__CAT||[])}).catch(function(){});
  return Promise.all([api("me").then(function(r){return r.ok?r.json():{user:null}}).catch(function(){return {user:null}}),
                      api("catalog").then(function(r){return r.json()}).catch(function(){return null})])
   .then(function(a){USER=a[0].user;if(a[1]){SIGNED=a[1].signed_in;index(a[1].rows)}});
}
var taxNote=function(r){return r.gstInc?"incl. GST":"+ GST"};
var href=function(pid){return STATIC[pid]?U("/product/"+pid+"/"):U("/item/?id="+encodeURIComponent(pid))};
var LOCK='<span class="plock"><svg><use href="#i-lock"/></svg>Sign in for price</span>';

/* ---------- header account ---------- */
function renderAccount(){
  $$(".acct").forEach(function(a){
    if(USER){a.innerHTML='<svg><use href="#i-user"/></svg><span>'+esc(USER.name.split(" ")[0])+'</span>';a.href=U("/account/");a.title="Your account"}
    else{a.innerHTML='<svg><use href="#i-user"/></svg><span>Sign in</span>';a.href=U("/account/")}
  });
  document.documentElement.classList.toggle("signed-in",!!USER);
}

/* ---------- prices on cards & product pages ---------- */
function hydratePrices(){
  $$("[data-pp]").forEach(function(el){
    var rows=(BYPID[el.dataset.pp]||[]); if(!SIGNED||!rows.length){return}
    var ps=rows.map(function(r){return r.price}).filter(Boolean); if(!ps.length){el.innerHTML="Price on request";return}
    var lo=Math.min.apply(null,ps),hi=Math.max.apply(null,ps);
    el.innerHTML=(el.dataset.mode==="range"?'<span class="now">'+(lo===hi?money(lo):money(lo)+" – "+money(hi))+'</span>':(lo!==hi?"<em>From</em> ":"")+money(lo))+' <small>'+taxNote(rows[0])+'</small>';
    el.classList.remove("locked");
  });
  $$("tr[data-sku]").forEach(function(tr){
    var r=BYSKU[tr.dataset.sku], td=tr.querySelector(".pr"), st=tr.querySelector(".stk"); if(!r)return;
    if(st) st.innerHTML=r.stock_status==="out_of_stock"?'<span class="stock out">Out of stock</span>':r.stock_status==="on_request"?'<span class="stock req">On request</span>':'<span class="stock in">In stock</span>';
    if(r.stock_status==="out_of_stock"){var b=tr.querySelector(".addc");if(b)b.disabled=true}
    if(td&&SIGNED) td.innerHTML=r.price?money(r.price)+(r.mrp>r.price?' <s>'+money(r.mrp)+'</s>':""):"On request";
  });
  var note=$("#priceNote"); if(note&&SIGNED&&USER) note.innerHTML='Showing your <b>'+esc(USER.customer_type)+'</b> prices.';
}

/* ---------- cart ---------- */
document.addEventListener("click",function(e){
  var b=e.target.closest(".qty button"); if(b){var i=b.parentNode.querySelector("input");var v=(parseInt(i.value,10)||1)+(b.dataset.d==="+"?1:-1);i.value=Math.max(parseInt(i.min,10)||1,v);i.dispatchEvent(new Event("change",{bubbles:true}));return}
  var a=e.target.closest(".addc"); if(a&&!a.disabled){var tr=a.closest("[data-sku]");var sku=tr.dataset.sku;var q=parseInt((tr.querySelector(".qty input")||{}).value,10)||1;var r=BYSKU[sku];
    CART[sku]=(CART[sku]||0)+Math.max(q,r?r.minq:1);saveCart();toast("Added to cart · "+(r?r.product_name+" – "+r.variant:sku),["View cart",U("/cart/")]);return}
  var rm=e.target.closest(".cline .rm"); if(rm){delete CART[rm.closest(".cline").dataset.sku];saveCart();renderCart();return}
  var lo=e.target.closest("[data-logout]"); if(lo){e.preventDefault();api("logout",{method:"POST"}).then(function(){location.href=U("/")});}
});
document.addEventListener("change",function(e){var l=e.target.closest(".cline");if(l&&e.target.matches(".qty input")){var r=BYSKU[l.dataset.sku];CART[l.dataset.sku]=Math.max(r?r.minq:1,parseInt(e.target.value,10)||1);saveCart();renderCart()}});
function lines(){return Object.keys(CART).map(function(s){return {r:BYSKU[s],sku:s,q:CART[s]}}).filter(function(l){return l.r})}
function renderCart(){
  var box=$("#cartLines"); if(!box) return;
  var L=lines(); $("#cartEmpty").hidden=!!L.length; $("#cartWrap").hidden=!L.length; if(!L.length) return;
  box.innerHTML=L.map(function(l){var r=l.r;return '<div class="cline" data-sku="'+esc(l.sku)+'"><img src="'+esc(U(r.image))+'" alt=""><div class="nm"><a href="'+href(r.product_id)+'">'+esc(r.product_name)+'</a><small>'+esc(r.variant)+' · Part no. '+esc(l.sku)+'</small><small>'+(SIGNED&&r.price?money(r.price)+' each, '+taxNote(r):'Price shown after sign-in')+'</small></div>'+
    '<div class="rt"><span class="qty"><button type="button" data-d="-" aria-label="Decrease">−</button><input type="number" min="'+r.minq+'" value="'+l.q+'" aria-label="Quantity"><button type="button" data-d="+" aria-label="Increase">+</button></span><span class="lt">'+(SIGNED&&r.price?money(r.price*l.q):'<span class="blurv">₹0,000</span>')+'</span><button type="button" class="rm">Remove</button></div></div>'}).join("");
  var sub=0,add=0,inc=0; L.forEach(function(l){var v=l.r.price*l.q;sub+=v;if(l.r.gstInc)inc+=v*l.r.gst/(100+l.r.gst);else add+=v*l.r.gst/100});
  var R=function(n){return money(Math.round(n*100)/100)};
  $("#sSub").innerHTML=SIGNED?R(sub):'<span class="blurv">₹00,000</span>'; $("#sGst").innerHTML=SIGNED?(add?R(add):"—"):'<span class="blurv">₹0,000</span>';
  $("#sTot").innerHTML=SIGNED?R(sub+add):'<span class="blurv">₹00,000</span>'; $("#sGstIn").textContent=SIGNED&&inc?"Includes "+R(inc)+" GST on MRP-priced items.":"";
  $("#signedOut").hidden=!!USER; $("#signedIn").hidden=!USER;
  if(USER){
    $("#who").innerHTML='<b>'+esc(USER.company||USER.name)+'</b><span>'+esc(USER.name)+' · '+esc(USER.phone)+(USER.gstin?' · GSTIN '+esc(USER.gstin):'')+'</span><span>'+esc([USER.city,USER.state].filter(Boolean).join(", "))+' · '+esc(USER.customer_type)+'</span>';
    var txt=L.map(function(l,i){return (i+1)+". "+l.r.product_name+" – "+l.r.variant+" ["+l.sku+"] × "+l.q+" @ "+money(l.r.price)+" ("+taxNote(l.r)+")"}).join("\n")+"\n\nItems total: "+R(sub)+(add?"\nGST extra: "+R(add):"")+"\nEstimated total: "+R(sub+add);
    var addr=$("#o-addr"); if(addr&&!addr.value) addr.value=USER.last_address||[USER.address,USER.city,USER.state,USER.pincode].filter(Boolean).join(", ");
    $("#waBtn").href="https://wa.me/"+WA+"?text="+encodeURIComponent("Hello MRO Mogul, order from "+(USER.company||USER.name)+":\n\n"+txt);
  }
}
var qb=$("#quoteBtn");
if(qb) qb.addEventListener("click",function(){
  var L=lines(); if(!L.length) return; if(!USER){location.href=U("/account/?next=cart");return}
  var m=$("#quoteMsg"), label=qb.innerHTML; qb.disabled=true; qb.textContent="Creating your official quotation…"; m.hidden=true;
  api("quote",{method:"POST",body:JSON.stringify({items:L.map(function(l){return {sku:l.sku,qty:l.q}})})})
   .then(function(r){var ct=r.headers.get("Content-Type")||"";
     if(r.ok&&ct.indexOf("pdf")>-1){var no=r.headers.get("X-Quote-Number")||"";return r.blob().then(function(b){var u=URL.createObjectURL(b);var a=document.createElement("a");a.href=u;a.download="MROMogul-Quotation-"+no+".pdf";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},4000);
       m.className="quote-msg ok";m.textContent="Quotation "+no+" downloaded. You can accept it any time from Your account → Quotations.";m.hidden=false})}
     return r.json().catch(function(){return {}}).then(function(d){m.className="quote-msg err";m.textContent=d.message||"Something went wrong. Please call +91 98840 64464.";m.hidden=false;if(r.status===401)setTimeout(function(){location.href=U("/account/?next=cart")},1200)})})
   .catch(function(){m.className="quote-msg err";m.textContent="Network error. Please try again.";m.hidden=false})
   .then(function(){qb.disabled=false;qb.innerHTML=label});
});
/* ---------- listings ---------- */
function cardHTML(pid){
  var rows=BYPID[pid]; if(!rows) return ""; var r=rows[0];
  return '<a class="pcard" href="'+href(pid)+'" data-pid="'+esc(pid)+'" data-brand="'+esc(r.brand)+'" data-cat="'+esc(r.category)+'" data-q="'+esc((r.product_name+" "+r.brand+" "+rows.map(function(x){return x.variant+" "+x.sku}).join(" ")).toLowerCase())+'">'+
   '<div class="ph"><img src="'+esc(U(r.image))+'" alt="'+esc(r.product_name)+'" loading="lazy"></div><div class="tx"><span class="brand">'+esc(r.brand)+'</span><h3>'+esc(r.product_name)+'</h3>'+
   '<div class="pfoot"><span class="price locked" data-pp="'+esc(pid)+'">'+LOCK+'</span><span class="opts">'+rows.length+(rows.length>1?" sizes":" option")+'</span></div></div></a>';
}
function hydrateList(){
  var g=$("#pgrid"); if(!g||!ROWS.length) return;
  var have={}; $$(".pcard",g).forEach(function(c){if(!BYPID[c.dataset.pid])c.remove();else have[c.dataset.pid]=1});
  var scope=g.dataset.scope||"", val=g.dataset.val||"";
  Object.keys(BYPID).forEach(function(pid){if(have[pid]||STATIC[pid])return;var r=BYPID[pid][0];
    if(scope==="cat"&&r.category!==val)return; if(scope==="brand"&&r.brand!==val)return; g.insertAdjacentHTML("beforeend",cardHTML(pid))});
}
$$(".pcard").forEach(function(c,i){c.dataset.i=i});
function filt(){
  var g=$("#pgrid"); if(!g) return; var q=(($("#fq")||{}).value||"").trim().toLowerCase(), words=q.split(/\s+/).filter(Boolean);
  var B=$$(".fbrand:checked").map(function(i){return i.value}), C=$$(".fcat:checked").map(function(i){return i.value}), n=0;
  $$(".pcard",g).forEach(function(c){var ok=words.every(function(w){return c.dataset.q.indexOf(w)>-1})&&(!B.length||B.indexOf(c.dataset.brand)>-1)&&(!C.length||C.indexOf(c.dataset.cat)>-1);c.hidden=!ok;if(ok)n++});
  var s=($("#fsort")||{}).value||"pop", cards=$$(".pcard",g);
  cards.sort(function(a,b){return s==="az"?a.querySelector("h3").textContent.localeCompare(b.querySelector("h3").textContent):(+a.dataset.i||0)-(+b.dataset.i||0)}).forEach(function(c){g.appendChild(c)});
  var ct=$("#fcount"); if(ct) ct.textContent=n+" product"+(n===1?"":"s"); var em=$("#fempty"); if(em) em.hidden=n>0;
}
document.addEventListener("input",function(e){if(e.target.id==="fq")filt()});
document.addEventListener("change",function(e){if(e.target.matches(".fbrand,.fcat,#fsort"))filt()});
(function(){var q=new URLSearchParams(location.search).get("q");if(q){$$("form[role=search] input").forEach(function(i){i.value=q});var f=$("#fq");if(f)f.value=q}})();

/* ---------- generic item page (products added later via CSV) ---------- */
function renderItem(){
  var box=$("#itemBox"); if(!box) return; var id=new URLSearchParams(location.search).get("id"), rows=BYPID[id];
  if(!rows){box.innerHTML='<div class="empty-cart"><h2>Product not found</h2><a class="btn btn-blue" href="'+U("/products/")+'">Browse products</a></div>';return}
  var r=rows[0]; document.title=r.product_name+" | MRO Mogul";
  box.innerHTML='<div class="pd"><div class="pd-img"><img src="'+esc(U(r.image))+'" alt=""></div><div class="pd-info"><div class="pd-brand"><b>'+esc(r.brand)+'</b>'+esc(CATS[r.category]||"")+'</div><h1>'+esc(r.product_name)+'</h1>'+
   '<div class="pd-price"><span class="price locked" data-pp="'+esc(id)+'" data-mode="range">'+LOCK+'</span></div>'+(r.description?'<p>'+esc(r.description)+'</p>':'')+
   '<div class="vtable-wrap"><table class="vtable"><thead><tr><th>Size / option</th><th>Part no.</th><th>Price</th><th>Stock</th><th>Qty</th><th></th></tr></thead><tbody>'+rows.map(function(x){return '<tr data-sku="'+esc(x.sku)+'"><td>'+esc(x.variant)+'</td><td class="sku">'+esc(x.sku)+'</td><td class="pr">'+LOCK+'</td><td class="stk"></td><td><span class="qty"><button type="button" data-d="-">−</button><input type="number" min="1" value="1"><button type="button" data-d="+">+</button></span></td><td><button type="button" class="addc"><svg><use href="#i-cart"/></svg>Add</button></td></tr>'}).join("")+'</tbody></table></div></div></div>';
}

/* ---------- place order (cart) ---------- */
var of=$("#signedIn");
if(of) of.addEventListener("submit",function(e){e.preventDefault();var a=$("#o-addr"),er=a.parentNode.querySelector(".err"),msg=of.querySelector(".fmsg");if(!a.value.trim()){er.hidden=false;a.focus();return}er.hidden=true;msg.hidden=true;
  var L=lines(); if(!L.length) return; var btn=$("#placeBtn");btn.disabled=true;btn.textContent="Placing your order…";
  api("order",{method:"POST",body:JSON.stringify({items:L.map(function(l){return {sku:l.sku,qty:l.q}}),delivery_address:a.value,po_number:($("#o-po")||{}).value||"",notes:($("#o-notes")||{}).value||""})})
   .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})})
   .then(function(x){if(!x.ok)throw x.d;$("#cartWrap").hidden=true;$("#orderDone").hidden=false;$("#doneTitle").textContent="Thank you. Order "+x.d.order+" has been placed.";CART={};saveCart();scrollTo({top:0})})
   .catch(function(d){msg.textContent=(d&&d.message)||"We couldn't place the order. Please use WhatsApp or call +91 98840 64464.";msg.hidden=false})
   .then(function(){btn.disabled=false;btn.textContent="Place order"})});

/* ---------- account: forms ---------- */
function setErr(form,errs){$$(".err",form).forEach(function(e){e.hidden=true});Object.keys(errs||{}).forEach(function(k){var i=form.querySelector('[name="'+k+'"]');if(!i)return;var w=i.closest(".fld,.ctype"),e=w&&w.querySelector(".err");if(e){e.textContent=errs[k];e.hidden=false}})}
function afterLogin(){var n=new URLSearchParams(location.search).get("next");location.href=U(n==="cart"?"/cart/":"/account/")}
function formSubmit(form,path,ok,extra){if(!form)return;form.addEventListener("submit",function(e){e.preventDefault();if(LOCAL){var l=$("#acctLocal");if(l)l.hidden=false;return}
  var btn=form.querySelector("button[type=submit]"),lab=btn.innerHTML,msg=form.querySelector(".fmsg");btn.disabled=true;btn.textContent="Please wait…";msg.hidden=true;
  var data={};new FormData(form).forEach(function(v,k){data[k]=v}); if(extra)Object.assign(data,extra());
  api(path,{method:"POST",body:JSON.stringify(data)}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})})
   .then(function(x){if(x.ok){setErr(form,{});ok(x.d,form,msg);return}setErr(form,x.d.errors);msg.className="fmsg quote-msg err";msg.textContent=x.d.message||"Please try again.";msg.hidden=false})
   .catch(function(){msg.className="fmsg quote-msg err";msg.textContent="Network error. Please try again.";msg.hidden=false})
   .then(function(){btn.disabled=false;btn.innerHTML=lab})})}
function okMsg(msg,t){msg.className="fmsg quote-msg";msg.textContent=t;msg.hidden=false}
var D=null, DQ={};
var ST={draft:"Draft",sent:"Open",accepted:"Accepted",declined:"Declined",invoiced:"Invoiced",expired:"Expired",open:"Confirmed",closed:"Completed",void:"Cancelled",
  overdue:"Overdue",unpaid:"Unpaid",partially_paid:"Part paid",paid:"Paid",viewed:"Unpaid",pending_approval:"Received",approved:"Confirmed"};
function badgeS(s,ex){var k=ex?"expired":s;return '<span class="sbadge s-'+esc(k)+'">'+esc(ST[k]||String(k||"").replace(/_/g," "))+'</span>'}
function fdate(d){if(!d)return "—";var p=d.split("-");return p.length===3?p[2]+" "+["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+p[1]-1]+" "+p[0]:d}
function dl(type,id,no){return '<a class="mini" href="'+BASE+'api/doc?type='+type+'&id='+encodeURIComponent(id)+'" download>'+'PDF</a>'}
function table(el,head,rows,empty){if(!el)return;el.innerHTML=rows.length?'<thead><tr>'+head.map(function(h){return '<th>'+h+'</th>'}).join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody>':'<tbody><tr><td class="dt-empty">'+empty+'</td></tr></tbody>';var hs=head.map(function(h){return h.replace(/<[^>]+>/g,"")});$$("tbody tr",el).forEach(function(tr){$$("td",tr).forEach(function(td,i){if(hs[i]&&!td.classList.contains("dt-empty"))td.setAttribute("data-label",hs[i])})})}
function dmsg(t,bad){var m=$("#dMsg");if(!m)return;m.className="dmsg quote-msg"+(bad?" err":"");m.textContent=t;m.hidden=false;scrollTo({top:m.getBoundingClientRect().top+scrollY-120,behavior:"smooth"})}
function loadIntoCart(items,from){var n=0;items.forEach(function(i){if(BYSKU[i.sku]){CART[i.sku]=i.qty;n++}});saveCart();
  if(!n){dmsg("These items are no longer in our online catalogue. Please contact us to reorder.",true);return}location.href=U("/cart/")+(from?"#from-"+encodeURIComponent(from):"")}
function buyAgain(src,btn){if(btn){btn.disabled=true;btn.textContent="Loading…"}
  api("reorder?src="+encodeURIComponent(src)).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})}).then(function(x){if(!x.ok)throw x.d;loadIntoCart(x.d.items,x.d.from)})
   .catch(function(d){dmsg((d&&d.message)||"Couldn't load that order.",true);if(btn){btn.disabled=false;btn.textContent="Buy again"}})}
function renderLast(){
  var html; var o=(D&&D.orders||[])[0];
  if(!D||!D.linked||!(D.orders.length||D.invoices.length)) html='<p class="small">No orders yet. Your last order will appear here so you can repeat it in one click.</p><a class="btn btn-amber" href="'+U("/products/")+'">Start shopping</a>';
  else html='<p>Repeat your most recent order'+(o?' <b>'+esc(o.salesorder_number)+'</b> of '+fdate(o.date)+' ('+money(num(o.total))+')':'')+' with today\'s prices. Everything is added to your cart so you can change quantities before ordering.</p><button type="button" class="btn btn-amber" data-again="last">Reorder last order</button>';
  ["#lastBox","#lastBox2"].forEach(function(s){var b=$(s);if(b)b.innerHTML=html});
}
function renderDash(){
  var s=D.summary||{}; $("#kOut").textContent=money(num(s.outstanding)); $("#kOutS").textContent=(s.unpaid_count||0)+" unpaid invoice"+(s.unpaid_count===1?"":"s")+(s.payment_terms?" · "+s.payment_terms:"");
  $("#kOver").textContent=money(num(s.overdue)); $(".kpi.warn").classList.toggle("on",num(s.overdue)>0); $("#kQ").textContent=s.open_quotes||0; $("#kO").textContent=(D.orders||[]).length;
  var setN=function(k,n){var b=$('[data-n="'+k+'"]');if(b){b.textContent=n;b.hidden=!n}}; setN("quotes",s.open_quotes); setN("invoices",s.unpaid_count);
  DQ={}; (D.quotes||[]).forEach(function(q){DQ[q.estimate_id]=q});
  var qrow=function(q,short){var canAcc=q.status==="sent"&&!q.expired;
    return '<tr><td><b>'+esc(q.estimate_number)+'</b>'+(q.reference_number?'<small>'+esc(q.reference_number)+'</small>':'')+'</td><td>'+fdate(q.date)+'</td>'+(short?'':'<td>'+fdate(q.expiry_date)+'</td>')+'<td class="r">'+money(num(q.total))+'</td><td>'+badgeS(q.status,q.expired)+'</td><td class="acts">'+
      (canAcc?'<button type="button" class="mini amber" data-accept="'+esc(q.estimate_id)+'">Accept</button>':'')+dl("estimate",q.estimate_id)+(short?'':'<button type="button" class="mini" data-again="estimate:'+esc(q.estimate_id)+'">'+(q.expired?'Re-quote':'Buy again')+'</button>')+'</td></tr>'};
  table($("#tQuotes"),["Quotation","Date","Valid till",'<span class="r">Amount</span>',"Status",""],(D.quotes||[]).map(function(q){return qrow(q)}),"No quotations yet. Add items to your cart and click “Download Official PDF quote instantly”.");
  table($("#recentQ"),["Quotation","Date",'<span class="r">Amount</span>',"Status",""],(D.quotes||[]).slice(0,4).map(function(q){return qrow(q,true)}),"No quotations yet.");
  table($("#tOrders"),["Order","Date","Your ref.",'<span class="r">Amount</span>',"Status",""],(D.orders||[]).map(function(o){
    return '<tr><td><b>'+esc(o.salesorder_number)+'</b></td><td>'+fdate(o.date)+'</td><td>'+esc(o.reference_number||"—")+'</td><td class="r">'+money(num(o.total))+'</td><td>'+badgeS(o.status)+(o.shipped_status&&o.shipped_status!=="pending"?' <small>'+esc(String(o.shipped_status).replace(/_/g," "))+'</small>':'')+'</td><td class="acts">'+dl("salesorder",o.salesorder_id)+'<button type="button" class="mini" data-again="salesorder:'+esc(o.salesorder_id)+'">Buy again</button></td></tr>'}),"No orders yet.");
  var irow=function(i){var due=num(i.balance)>0;return '<tr class="'+(i.status==="overdue"?"od":"")+'"><td><b>'+esc(i.invoice_number)+'</b></td><td>'+fdate(i.date)+'</td><td>'+fdate(i.due_date)+'</td><td class="r">'+money(num(i.total))+'</td><td class="r">'+(due?'<b>'+money(num(i.balance))+'</b>':'—')+'</td><td>'+badgeS(i.status)+'</td><td class="acts">'+dl("invoice",i.invoice_id)+'<button type="button" class="mini" data-again="invoice:'+esc(i.invoice_id)+'">Buy again</button></td></tr>'};
  var H=["Invoice","Date","Due",'<span class="r">Amount</span>','<span class="r">Balance</span>',"Status",""];
  table($("#tPending"),H,(D.invoices||[]).filter(function(i){return num(i.balance)>0}).map(irow),"No pending invoices. Thank you!");
  table($("#tInv"),H,(D.invoices||[]).map(irow),"No invoices yet.");
  renderLast();
}
function loadDash(){
  api("portal").then(function(r){return r.json()}).then(function(d){D=d;
    if(!d.ready){dmsg("Your quotations, orders and invoices will appear here once our accounting system is connected.",false);D={orders:[],quotes:[],invoices:[],summary:{}}}
    renderDash()}).catch(function(){dmsg("We couldn't load your account details just now. Please refresh in a minute.",true)});
}
function showTab(k){var dm=$("#dMsg");if(dm)dm.hidden=true;if(!$('[data-panel="'+k+'"]'))k="overview";$$(".dpanel").forEach(function(p){p.hidden=p.dataset.panel!==k});$$(".dtabs a").forEach(function(a){a.setAttribute("aria-current",a.dataset.tab===k?"page":"false")})}
function fy(off){var n=new Date(),y=n.getMonth()>=3?n.getFullYear():n.getFullYear()-1;y-=off||0;return [y+"-04-01",off?(y+1)+"-03-31":n.toISOString().slice(0,10)]}
function renderAccountPage(){
  var box=$("#acctBox"); if(!box) return; var qs=new URLSearchParams(location.search);
  if(LOCAL){$("#acctLocal").hidden=false}
  if(qs.get("unsubscribed")==="1"){var n=$("#acctNote");n.textContent="You will no longer receive reorder reminder emails. You can turn them back on under Reorder & reminders.";n.hidden=false}
  if(USER){box.hidden=true;var d=$("#dash");d.hidden=false;
    $("#dName").textContent="Welcome, "+USER.name.split(" ")[0];$("#dSub").textContent=[USER.company,USER.customer_type,USER.gstin?"GSTIN "+USER.gstin:""].filter(Boolean).join(" · ");
    $("#profTable").innerHTML=[["Name",USER.name],["Company",USER.company||"—"],["Customer type",USER.customer_type],["Email",USER.email],["Mobile",USER.phone],["GSTIN",USER.gstin||"—"],["Address",[USER.address,USER.city,USER.state,USER.pincode].filter(Boolean).join(", ")||"—"]].map(function(r){return '<tr><th>'+r[0]+'</th><td>'+esc(r[1])+'</td></tr>'}).join("");
    var rd=$("#remDays");rd.value=String(USER.reminder_days||0);var rs=$("#remState");rs.textContent=USER.reminder_days?"On":"";if(!USER.emails_enabled&&USER.reminder_days)rs.textContent="Saved. Emails start once our mail service is switched on.";
    showTab((location.hash||"#overview").slice(1)); addEventListener("hashchange",function(){showTab(location.hash.slice(1))});
    var f=fy(0);$("#stFrom").value=f[0];$("#stTo").value=f[1];
    loadDash(); return}
  var show=function(t){$$(".atab").forEach(function(x){x.setAttribute("aria-selected",x.dataset.t===t)});$("#loginForm").hidden=t!=="in";$("#regForm").hidden=t!=="up";$("#forgotForm").hidden=t!=="fp"};
  $$(".atab").forEach(function(t){t.addEventListener("click",function(){show(t.dataset.t)})});
  if(location.hash==="#register") show("up");
  $("#forgotLink").addEventListener("click",function(e){e.preventDefault();show("fp");$("#f-email").value=$("#l-email").value});
  $("#backLogin").addEventListener("click",function(e){e.preventDefault();show("in")});
  var g=$("#r-gstin"),stMap={"33":"Tamil Nadu","29":"Karnataka","37":"Andhra Pradesh","28":"Andhra Pradesh","32":"Kerala","36":"Telangana","34":"Puducherry","27":"Maharashtra"};
  if(g)g.addEventListener("input",function(){var s=stMap[g.value.trim().slice(0,2)];if(s)$("#r-state").value=s});
  formSubmit($("#loginForm"),"login",afterLogin); formSubmit($("#regForm"),"register",afterLogin);
  formSubmit($("#forgotForm"),"password",function(d,f,m){okMsg(m,d.message)});
}
/* dashboard actions */
document.addEventListener("click",function(e){
  var a=e.target.closest("[data-again]"); if(a){e.preventDefault();buyAgain(a.dataset.again,a);return}
  var c=e.target.closest("[data-accept]"); if(c){var q=DQ[c.dataset.accept];var dlg=$("#accDlg");$("#accNo").textContent=q.estimate_number+" · "+money(num(q.total));$("#accPo").value="";dlg.querySelector(".fmsg").hidden=true;dlg.dataset.id=q.estimate_id;dlg.showModal?dlg.showModal():dlg.setAttribute("open","");return}
  var ch=e.target.closest(".chip[data-range]"); if(ch){var r=ch.dataset.range,v;if(r==="fy")v=fy(0);else if(r==="lfy")v=fy(1);else{var t=new Date();v=[new Date(t-90*864e5).toISOString().slice(0,10),t.toISOString().slice(0,10)]}$("#stFrom").value=v[0];$("#stTo").value=v[1];return}
});
var acf=$("#accForm");
if(acf) acf.addEventListener("submit",function(e){var dlg=$("#accDlg");if(e.submitter&&e.submitter.value==="cancel")return;e.preventDefault();
  var btn=$("#accOk"),m=acf.querySelector(".fmsg");btn.disabled=true;btn.textContent="Accepting…";m.hidden=true;
  api("quote-action",{method:"POST",body:JSON.stringify({id:dlg.dataset.id,action:"accept",po:$("#accPo").value})}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})})
   .then(function(x){if(!x.ok){m.textContent=x.d.message;m.hidden=false;return}dlg.close&&dlg.close();dlg.removeAttribute("open");dmsg("Thank you. Quotation accepted"+(x.d.order?" and order "+x.d.order+" placed":"")+". A confirmation email is on its way.");loadDash()})
   .catch(function(){m.textContent="Network error. Please try again.";m.hidden=false}).then(function(){btn.disabled=false;btn.textContent="Accept and place order"})});
var stf=$("#stForm");
if(stf) stf.addEventListener("submit",function(e){e.preventDefault();var btn=stf.querySelector("button"),lab=btn.innerHTML;btn.disabled=true;btn.textContent="Preparing statement…";
  api("statement?from="+$("#stFrom").value+"&to="+$("#stTo").value).then(function(r){if(r.ok&&(r.headers.get("Content-Type")||"").indexOf("pdf")>-1)return r.blob().then(function(b){var u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="MROMogul-Statement-"+$("#stFrom").value+"-to-"+$("#stTo").value+".pdf";document.body.appendChild(a);a.click();a.remove()});
    return r.json().then(function(d){dmsg(d.message||"Couldn't generate the statement.",true)})}).catch(function(){dmsg("Network error. Please try again.",true)}).then(function(){btn.disabled=false;btn.innerHTML=lab})});
var rmf=$("#remForm");
if(rmf) rmf.addEventListener("submit",function(e){e.preventDefault();var v=$("#remDays").value;api("prefs",{method:"POST",body:JSON.stringify({reminder_days:v})}).then(function(r){return r.json()}).then(function(d){USER=d.user||USER;
  $("#remState").textContent=+v?"Saved. We'll remind you "+v+" days after each order.":"Reminders are off."})});
formSubmit($("#pwForm"),"prefs",function(d,f,m){okMsg(m,"Password updated.");f.reset()});

/* ---------- password reset page ---------- */
formSubmit($("#resetForm"),"password",function(){location.href=U("/account/")},function(){return {t:new URLSearchParams(location.search).get("t")}});
var rsf=$("#resetForm"); if(rsf) rsf.addEventListener("submit",function(e){if($("#n-pass").value!==$("#n-pass2").value){e.stopImmediatePropagation();e.preventDefault();var m=rsf.querySelector(".fmsg");m.className="fmsg quote-msg err";m.textContent="The two passwords don't match.";m.hidden=false}},true);

/* ---------- one-click reorder page (from email) ---------- */
function renderReorder(){
  var box=$("#roBox"); if(!box) return; var t=new URLSearchParams(location.search).get("t");
  if(!t){location.href=U("/account/#reorder");return}
  api("reorder?t="+encodeURIComponent(t)).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})}).then(function(x){
    if(!x.ok){$("#roTitle").textContent=x.d.message||"This link has expired.";$("#roSub").innerHTML='<a href="'+U("/account/#reorder")+'">Sign in to reorder from your account →</a>';return}
    var d=x.d,tot=0; $("#roTitle").textContent="Reorder "+d.last.number+" for "+(d.user.company||d.user.name);
    $("#roSub").textContent="Same items as your order of "+fdate(d.last.date)+", at today's prices.";
    table($("#roTable"),["Item","Part no.",'<span class="r">Qty</span>','<span class="r">Price</span>','<span class="r">Amount</span>'],d.items.map(function(i){var amt=i.rate*i.qty;tot+=i.gst_included?amt:amt*(1+i.gst/100);
      return '<tr><td>'+esc(i.name)+'</td><td class="sku">'+esc(i.sku)+'</td><td class="r">'+i.qty+'</td><td class="r">'+money(i.rate)+' <small>'+(i.gst_included?"incl. GST":"+ GST")+'</small></td><td class="r">'+money(Math.round(amt*100)/100)+'</td></tr>'}),"");
    $("#roTable").insertAdjacentHTML("beforeend",'<tfoot><tr><td colspan="4" class="r"><b>Estimated total incl. GST</b></td><td class="r"><b>'+money(Math.round(tot))+'</b></td></tr></tfoot>');
    if(d.skipped&&d.skipped.length)$("#roSub").textContent+=" "+d.skipped.length+" item(s) are no longer available and were left out.";
    $("#ro-addr").value=d.user.address||""; $("#roCard").hidden=false;
    $("#roEdit").addEventListener("click",function(e){e.preventDefault();loadIntoCart(d.items.map(function(i){return {sku:i.sku,qty:i.qty}}))});
    if(d.used){$("#roBtn").disabled=true;$("#roBtn").textContent="Already reordered"}
  });
  $("#roForm").addEventListener("submit",function(e){e.preventDefault();var b=$("#roBtn"),m=$("#roForm .fmsg");b.disabled=true;b.textContent="Placing your order…";m.hidden=true;
    api("reorder",{method:"POST",body:JSON.stringify({t:t,delivery_address:$("#ro-addr").value,po_number:$("#ro-po").value})}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d}})})
     .then(function(x){if(!x.ok){m.className="fmsg quote-msg err";m.textContent=x.d.message;m.hidden=false;b.disabled=false;b.textContent="Place this order";return}
       $("#roCard").hidden=true;$("#roDone").hidden=false;$("#roDoneT").textContent="Thank you. Order "+x.d.order+" has been placed."})
     .catch(function(){m.className="fmsg quote-msg err";m.textContent="Network error. Please try again.";m.hidden=false;b.disabled=false;b.textContent="Place this order"})});
}


/* ---------- blog filter ---------- */
$$(".blog-chips .chip").forEach(function(c){c.addEventListener("click",function(){var t=c.dataset.bt;$$(".blog-chips .chip").forEach(function(x){x.setAttribute("aria-pressed",x===c)});$$("#postGrid .post-card").forEach(function(p){p.hidden=!!t&&p.dataset.type!==t})})});
/* ---------- menu ---------- */
var nav=$("#nav"),mb=$("#menuBtn"); if(mb) mb.addEventListener("click",function(){var o=nav.dataset.open!=="true";nav.dataset.open=o;mb.setAttribute("aria-expanded",o)});
$$("form[role=search]").forEach(function(f){f.addEventListener("submit",function(e){if(!LOCAL)return;e.preventDefault();location.href=U(f.getAttribute("data-to")||"/products/")+"?q="+encodeURIComponent(f.querySelector("input").value)})});

badge();
boot().then(function(){renderAccount();hydrateList();renderItem();filt();hydratePrices();renderCart();renderAccountPage();renderReorder()});
})();
