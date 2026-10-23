// Shared helpers for MRO Mogul functions.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const json = (status, obj, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

/* ---------------- products (private CSV) ---------------- */
export function parseCSV(t) {
  t = t.replace(/^﻿/, "");
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); f = ""; if (row.join("").trim()) rows.push(row); row = []; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); if (row.join("").trim()) rows.push(row); }
  const head = rows.shift().map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.map(r => Object.fromEntries(head.map((h, k) => [h, (r[k] || "").trim()])));
}
export const num = v => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
let PRODUCTS = null, PRODUCTS_AT = 0;
export function products() {
  if (PRODUCTS && Date.now() - PRODUCTS_AT < 60e3) return PRODUCTS;
  const cands = [process.env.PRODUCTS_CSV_PATH, path.resolve("data/products.csv"),
    process.env.LAMBDA_TASK_ROOT && path.join(process.env.LAMBDA_TASK_ROOT, "data/products.csv"),
    path.join(path.dirname(new URL(import.meta.url).pathname), "../../data/products.csv")].filter(Boolean);
  for (const p of cands) { try { PRODUCTS = parseCSV(fs.readFileSync(p, "utf8")); PRODUCTS_AT = Date.now(); return PRODUCTS; } catch {} }
  throw new Error("products.csv not found");
}
export function priceFor(r, user) {
  const base = num(r.selling_price) || num(r.mrp);
  if (user && /reseller/i.test(user.customer_type) && num(r.reseller_price)) return num(r.reseller_price);
  return base;
}

/* ---------------- users (Netlify Blobs, or a folder when testing locally) ---------------- */
async function store() {
  if (process.env.LOCAL_BLOBS_DIR) {
    const dir = process.env.LOCAL_BLOBS_DIR; fs.mkdirSync(dir, { recursive: true });
    const f = k => path.join(dir, encodeURIComponent(k) + ".json");
    return { get: async k => { try { return JSON.parse(fs.readFileSync(f(k), "utf8")); } catch { return null; } },
             setJSON: async (k, v) => fs.writeFileSync(f(k), JSON.stringify(v)),
             keys: async prefix => fs.readdirSync(dir).map(n => decodeURIComponent(n.replace(/\.json$/, ""))).filter(k => k.startsWith(prefix)) };
  }
  const { getStore } = await import("@netlify/blobs");
  const s = getStore({ name: "mm-users", consistency: "strong" });
  return { get: k => s.get(k, { type: "json" }), setJSON: (k, v) => s.setJSON(k, v),
           keys: async prefix => { const out = []; for await (const page of s.list({ prefix, paginate: true })) out.push(...page.blobs.map(b => b.key)); return out; } };
}
export const userKey = e => "u:" + String(e || "").trim().toLowerCase();
export async function getUser(email) { return (await store()).get(userKey(email)); }
export async function allUsers() { const st = await store(); const ks = await st.keys("u:"); const out = []; for (const k of ks) { const u = await st.get(k); if (u) out.push(u); } return out; }
export async function saveUser(u) { u.updated = new Date().toISOString(); return (await store()).setJSON(userKey(u.email), u); }

export function hashPassword(pw, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString("hex") };
}
export function checkPassword(pw, u) {
  const h = crypto.scryptSync(String(pw), u.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(u.hash, "hex"));
}

/* ---------------- session cookie (HMAC-signed) ---------------- */
const SECRET = () => { if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET not set"); return process.env.SESSION_SECRET; };
const b64 = s => Buffer.from(s).toString("base64url");
export function makeSession(u) {
  const body = b64(JSON.stringify({ e: u.email, exp: Date.now() + 30 * 864e5 }));
  const sig = crypto.createHmac("sha256", SECRET()).update(body).digest("base64url");
  const secure = process.env.LOCAL_DEV ? "" : "; Secure";
  return `mm_s=${body}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`;
}
export const clearSession = () => `mm_s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.LOCAL_DEV ? "" : "; Secure"}`;
export async function sessionUser(req) {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)mm_s=([^;]+)/); if (!m) return null;
  const [body, sig] = m[1].split("."); if (!body || !sig) return null;
  const good = crypto.createHmac("sha256", SECRET()).update(body).digest("base64url");
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
  if (!p.exp || p.exp < Date.now()) return null;
  const u = await getUser(p.e); return u && !u.disabled ? u : null;
}
export const publicProfile = u => ({ name: u.name, company: u.company, email: u.email, phone: u.phone, gstin: u.gstin, customer_type: u.customer_type,
  address: u.address, city: u.city, state: u.state, pincode: u.pincode, crm_synced: !!u.crm_account_id,
  last_address: u.last_address || "", reminder_days: u.reminder_days || 0, last_reminder: u.last_reminder || null, emails_enabled: mailReady() });

/* ---------------- Zoho (one Self Client covers CRM + Books) ---------------- */
const ACC = () => process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.in";
const APID = () => process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.in";
let tok = { t: null, exp: 0 };
export const zohoReady = () => !!(process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
export async function zohoToken() {
  if (tok.t && Date.now() < tok.exp) return tok.t;
  const r = await fetch(`${ACC()}/oauth/v2/token?refresh_token=${encodeURIComponent(process.env.ZOHO_REFRESH_TOKEN)}&client_id=${encodeURIComponent(process.env.ZOHO_CLIENT_ID)}&client_secret=${encodeURIComponent(process.env.ZOHO_CLIENT_SECRET)}&grant_type=refresh_token`, { method: "POST" });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) throw new Error("Zoho login failed: " + (d.error || r.status));
  tok = { t: d.access_token, exp: Date.now() + ((d.expires_in || 3600) - 120) * 1000 };
  return tok.t;
}
async function zcall(url, opts = {}) {
  const t = await zohoToken();
  const r = await fetch(url, { ...opts, headers: { Authorization: `Zoho-oauthtoken ${t}`, ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) } });
  if (opts.raw) { if (!r.ok) throw new Error("Zoho file error " + r.status); return r; }
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok || (typeof d.code === "number" && d.code !== 0)) throw new Error("Zoho: " + (d.message || JSON.stringify(d).slice(0, 300) || r.status));
  return d;
}
export const books = (p, o) => zcall(`${APID()}/books/v3${p}${p.includes("?") ? "&" : "?"}organization_id=${process.env.ZOHO_ORG_ID}`, o);
export const crm = (p, o) => zcall(`${APID()}/crm/${process.env.ZOHO_CRM_VERSION || "v8"}${p}`, o);

export const STATE_CODES = { "Andhra Pradesh": "AP", "Karnataka": "KA", "Kerala": "KL", "Tamil Nadu": "TN", "Telangana": "TS", "Puducherry": "PY", "Maharashtra": "MH", "Goa": "GA", "Gujarat": "GJ", "Delhi": "DL", "Odisha": "OD", "West Bengal": "WB" };

/* Create / update the customer's profile in Zoho CRM (Account + Contact). */
export async function syncCRM(u) {
  const F_GST = process.env.CRM_FIELD_GSTIN || "GSTIN";
  const F_TYPE = process.env.CRM_FIELD_CUSTOMER_TYPE || "Customer_Type";
  const accountName = u.company || u.name;
  const acc = { Account_Name: accountName, Phone: u.phone, Billing_Street: u.address, Billing_City: u.city, Billing_State: u.state, Billing_Code: u.pincode, Billing_Country: "India",
    [F_TYPE]: u.customer_type, ...(u.gstin ? { [F_GST]: u.gstin } : {}), Description: "Registered on mromogul.com" };
  const a = await crm("/Accounts/upsert", { method: "POST", body: JSON.stringify({ data: [acc], duplicate_check_fields: ["Account_Name"] }) });
  const ar = a.data && a.data[0]; if (!ar || ar.status !== "success") throw new Error("CRM account: " + JSON.stringify(ar || a).slice(0, 300));
  const [first, ...rest] = String(u.name).trim().split(/\s+/);
  const con = { First_Name: rest.length ? first : "", Last_Name: rest.length ? rest.join(" ") : first, Email: u.email, Mobile: u.phone,
    Account_Name: { id: ar.details.id }, Mailing_Street: u.address, Mailing_City: u.city, Mailing_State: u.state, Mailing_Zip: u.pincode, Mailing_Country: "India",
    [F_TYPE]: u.customer_type, ...(process.env.CRM_LEAD_SOURCE ? { Lead_Source: process.env.CRM_LEAD_SOURCE } : {}) };
  const c = await crm("/Contacts/upsert", { method: "POST", body: JSON.stringify({ data: [con], duplicate_check_fields: ["Email"] }) });
  const cr = c.data && c.data[0]; if (!cr || cr.status !== "success") throw new Error("CRM contact: " + JSON.stringify(cr || c).slice(0, 300));
  u.crm_account_id = ar.details.id; u.crm_contact_id = cr.details.id; delete u.crm_error;
  return u;
}

/* ---------------- signed links (email reorder, unsubscribe, password reset) ---------------- */
export function signToken(payload, days = 14) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + days * 864e5 }));
  return body + "." + crypto.createHmac("sha256", SECRET()).update("t:" + body).digest("base64url");
}
export function readToken(t) {
  const [body, sig] = String(t || "").split("."); if (!body || !sig) return null;
  const good = crypto.createHmac("sha256", SECRET()).update("t:" + body).digest("base64url");
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
export const SITE = () => (process.env.SITE_URL || "https://mromogul.com").replace(/\/$/, "");

/* ---------------- email (Zoho ZeptoMail) ---------------- */
export const mailReady = () => !!(process.env.ZEPTO_TOKEN && process.env.MAIL_FROM);
export async function sendMail({ to, name, subject, html, bccSales = false }) {
  if (!mailReady()) { console.log("[mail skipped]", to, subject); return false; }
  const token = process.env.ZEPTO_TOKEN.replace(/^zoho-enczapikey\s+/i, "");
  const body = { from: { address: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || "MRO Mogul" },
    to: [{ email_address: { address: to, name: name || to } }], subject, htmlbody: html,
    ...(process.env.MAIL_BOUNCE ? { bounce_address: process.env.MAIL_BOUNCE } : {}),
    ...(bccSales && process.env.MAIL_SALES ? { bcc: [{ email_address: { address: process.env.MAIL_SALES, name: "MRO Mogul Sales" } }] } : {}) };
  const r = await fetch(process.env.ZEPTO_API || "https://api.zeptomail.in/v1.1/email", { method: "POST",
    headers: { Authorization: "Zoho-enczapikey " + token, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { console.error("mail failed", r.status, await r.text().catch(() => "")); return false; }
  return true;
}
const H = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const esc = H;
export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export function mailLayout(title, inner) {
  return `<!doctype html><html><body style="margin:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;color:#121B25">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#121B25;padding:18px 24px;color:#fff;font-size:20px;font-weight:bold">MRO<span style="color:#F2B329">MOGUL</span></td></tr>
<tr><td style="padding:26px 24px 8px"><h1 style="font-size:20px;margin:0 0 14px">${H(title)}</h1>${inner}</td></tr>
<tr><td style="padding:18px 24px 24px;font-size:12px;color:#56616D;border-top:1px solid #E2E6EA">MRO Mogul, a unit of Accelfast Industrial Enterprises · 165 Broadway, Chennai 600108 · +91 98840 64464</td></tr>
</table></td></tr></table></body></html>`;
}
export const mailButton = (href, label, bg = "#F2B329", fg = "#121B25") =>
  `<p style="margin:22px 0"><a href="${H(href)}" style="background:${bg};color:${fg};text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:6px;display:inline-block">${H(label)}</a></p>`;
export function mailItems(items) {
  return `<table role="presentation" width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr style="background:#F3F4F6"><th align="left">Item</th><th align="left">Part no.</th><th align="right">Qty</th></tr>` +
    items.map(i => `<tr style="border-bottom:1px solid #E2E6EA"><td>${H(i.name)}</td><td style="font-family:monospace">${H(i.sku || "")}</td><td align="right">${H(i.qty)}</td></tr>`).join("") + "</table>";
}

/* ---------------- Books: customer + lines + documents ---------------- */
export const HOME_STATE = () => process.env.HOME_STATE_CODE || "TN";
export const ymd = d => d.toISOString().slice(0, 10);
export const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
export async function booksCustomer(u, create = true) {
  if (u.books_contact_id) return u.books_contact_id;
  const tries = [];
  if (u.crm_account_id) tries.push(`zcrm_account_id=${u.crm_account_id}`);
  if (u.gstin) tries.push(`gst_no=${encodeURIComponent(u.gstin)}`);
  tries.push(`email=${encodeURIComponent(u.email)}`);
  if (u.company) tries.push(`contact_name=${encodeURIComponent(u.company)}`);
  for (const q of tries) {
    try { const d = await books(`/contacts?contact_type=customer&${q}`); if (d.contacts && d.contacts.length) { u.books_contact_id = d.contacts[0].contact_id; return u.books_contact_id; } } catch {}
  }
  if (!create) return null;
  const st = STATE_CODES[u.state] || "";
  const d = await books("/contacts", { method: "POST", body: JSON.stringify({
    contact_name: u.company || u.name, company_name: u.company || "", contact_type: "customer",
    gst_treatment: u.gstin ? "business_gst" : "consumer", ...(u.gstin ? { gst_no: u.gstin } : {}), ...(st ? { place_of_contact: st } : {}),
    billing_address: { address: u.address, city: u.city, state: u.state, zip: u.pincode, country: "India" },
    contact_persons: [{ first_name: u.name, email: u.email, mobile: u.phone, is_primary_contact: true }],
    notes: `Website customer (${u.customer_type}). CRM account ${u.crm_account_id || "pending"}.` }) });
  u.books_contact_id = d.contact.contact_id; return u.books_contact_id;
}
/* Turn [{sku,qty}] into Books line items at this customer's current price. */
export function buildLines(items, u) {
  const bySku = Object.fromEntries(products().map(r => [r.sku, r]));
  const st = STATE_CODES[u.state] || "";
  const taxId = (!st || st === HOME_STATE()) ? process.env.ZOHO_TAX_ID_INTRA : process.env.ZOHO_TAX_ID_INTER;
  const lines = [], skipped = [], view = [];
  for (const it of (items || []).slice(0, 80)) {
    const r = bySku[it.sku]; if (!r || /hidden|out_of_stock/i.test(r.stock_status)) { skipped.push(it.sku); continue; }
    const qty = Math.max(num(r.min_order_qty) || 1, Math.min(100000, parseInt(it.qty, 10) || 1));
    const price = priceFor(r, u), gr = num(r.gst_rate) || 18;
    const rate = /^y/i.test(r.gst_included) ? Math.round(price / (1 + gr / 100) * 100) / 100 : price;
    lines.push({ name: `${r.product_name} - ${r.variant}`.slice(0, 200), description: `Brand: ${r.brand} | Part no: ${r.sku}`, rate, quantity: qty, unit: "pcs",
      product_type: "goods", ...(r.hsn ? { hsn_or_sac: r.hsn } : {}), ...(taxId ? { tax_id: taxId } : {}) });
    view.push({ sku: r.sku, name: `${r.product_name} – ${r.variant}`, qty, rate: price, gst_included: /^y/i.test(r.gst_included), gst: gr, image: r.image, product_id: r.product_id });
  }
  return { lines, skipped, view, place_of_supply: st };
}
/* Map a Books document's line items back to our part numbers (for "buy again"). */
export function itemsFromDoc(doc) {
  const known = new Set(products().map(r => r.sku)), out = [];
  for (const li of doc.line_items || []) {
    const m = String(li.description || "").match(/Part no:\s*([^|\n]+)/i);
    const cands = [m && m[1].trim(), li.sku, li.item_custom_fields && null].filter(Boolean);
    const sku = cands.find(c => known.has(c));
    if (sku) out.push({ sku, qty: Math.max(1, Math.round(num(li.quantity))) });
  }
  return out;
}
const DOCS = { estimate: ["estimates", "estimate"], salesorder: ["salesorders", "salesorder"], invoice: ["invoices", "invoice"] };
/* Fetch a document and make sure it belongs to this customer. */
export async function ownDoc(u, type, id) {
  const d = DOCS[type]; if (!d || !/^\d+$/.test(String(id)) || !u.books_contact_id) return null;
  const r = await books(`/${d[0]}/${id}`); const doc = r[d[1]];
  return doc && String(doc.customer_id) === String(u.books_contact_id) ? doc : null;
}
export async function docPdf(type, id) {
  const r = await books(`/${DOCS[type][0]}/${id}?accept=pdf`, { raw: true, headers: { Accept: "application/pdf" } });
  return Buffer.from(await r.arrayBuffer());
}
/* Most recent order (sales order, else invoice) for reorder + reminders. */
export async function lastOrder(u) {
  if (!u.books_contact_id) return null;
  for (const [list, key, type] of [["salesorders", "salesorders", "salesorder"], ["invoices", "invoices", "invoice"]]) {
    let d; try { d = await books(`/${list}?customer_id=${u.books_contact_id}&sort_column=date&sort_order=D&per_page=10`); } catch { continue; }
    for (const s of (d[key] || []).filter(x => !/void|draft_cancel|declined/i.test(x.status || ""))) {
      const id = s.salesorder_id || s.invoice_id;
      const full = (await books(`/${list}/${id}`))[type];
      const items = itemsFromDoc(full);
      if (items.length) return { type, id, number: s.salesorder_number || s.invoice_number, date: s.date, items };
    }
  }
  return null;
}
/* Create a Books sales order for this customer from cart-style items. */
export async function createSalesOrder(u, items, { po = "", address = "", notes = "", source = "Website order" } = {}) {
  const b = buildLines(items, u); if (!b.lines.length) { const e = new Error("No orderable items"); e.code = 400; throw e; }
  if (!u.crm_account_id) { try { await syncCRM(u); } catch (e) { u.crm_error = String(e.message || e).slice(0, 300); } }
  await booksCustomer(u); if (address) u.last_address = address; await saveUser(u);
  const today = istNow();
  const so = (await books("/salesorders", { method: "POST", body: JSON.stringify({
    customer_id: u.books_contact_id, date: ymd(today), reference_number: (po || ("WEB-" + ymd(today).replace(/-/g, "") + "-" + String(Date.now()).slice(-5))).slice(0, 50),
    ...(b.place_of_supply ? { place_of_supply: b.place_of_supply } : {}), gst_treatment: u.gstin ? "business_gst" : "consumer", ...(u.gstin ? { gst_no: u.gstin } : {}),
    is_inclusive_tax: false, line_items: b.lines,
    notes: [`${source} on mromogul.com by ${u.name} (${u.customer_type}).`, address && `Deliver to: ${address}`, notes && `Customer notes: ${notes}`].filter(Boolean).join("\n").slice(0, 2000),
    terms: process.env.ORDER_TERMS || "Order subject to stock confirmation. Freight extra unless stated. Payment against proforma invoice by bank transfer / UPI unless credit terms are agreed." }) })).salesorder;
  await Promise.allSettled([crmNote(u, `${source} ${so.salesorder_number}`, `${u.name} placed ${so.salesorder_number} (${b.lines.length} items, total ${inr(so.total)}) on mromogul.com.${po ? " PO: " + po : ""}`),
  sendMail({ to: u.email, name: u.name, bccSales: true, subject: `Order received: ${so.salesorder_number}`,
    html: mailLayout(`Thank you, we have received your order ${so.salesorder_number}`,
      `<p>Hello ${H(u.name)},</p><p>Your order has been recorded in our system. Our team will confirm stock and freight and send you a proforma invoice shortly.</p>${mailItems(b.view)}
       <p style="margin-top:14px"><b>Order value:</b> ${inr(so.total)} (incl. GST, before freight)${po ? `<br><b>Your PO:</b> ${H(po)}` : ""}${address ? `<br><b>Deliver to:</b> ${H(address)}` : ""}</p>
       ${mailButton(SITE() + "/account/#orders", "View your orders")}`) })]);
  return { so, view: b.view, skipped: b.skipped };
}
export function crmNote(u, title, content) {
  if (!u.crm_account_id || !zohoReady()) return Promise.resolve();
  return crm(`/Accounts/${u.crm_account_id}/Notes`, { method: "POST", body: JSON.stringify({ data: [{ Note_Title: title, Note_Content: content }] }) }).catch(e => console.error("CRM note", e));
}
