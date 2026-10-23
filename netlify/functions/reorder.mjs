// Reorder.
//  GET  /api/reorder?src=last | salesorder:ID | invoice:ID | estimate:ID   (signed in)  -> items to load into the cart
//  GET  /api/reorder?t=TOKEN    (one-click link from a reminder email)                   -> what will be ordered, with prices
//  POST /api/reorder {t}        -> places the same order again as a Sales Order
import { json, sessionUser, getUser, saveUser, readToken, ownDoc, itemsFromDoc, lastOrder, buildLines, createSalesOrder, makeSession, publicProfile } from "../lib/core.mjs";
export default async (req) => {
  const q = new URL(req.url).searchParams;
  try {
    if (req.method === "POST") {
      let b; try { b = await req.json(); } catch { return json(400, { message: "Invalid request" }); }
      const t = readToken(b.t); if (!t || t.p !== "reorder") return json(403, { message: "This reorder link has expired. Please sign in to reorder." });
      const u = await getUser(t.e); if (!u || u.disabled) return json(403, { message: "Account not found." });
      if ((u.used_links || []).includes(t.n)) return json(409, { message: "This reorder has already been placed. Check your orders in your account." });
      const last = await lastOrder(u); if (!last) return json(404, { message: "We couldn't find your last order." });
      const address = String(b.delivery_address || u.last_address || [u.address, u.city, u.state, u.pincode].filter(Boolean).join(", ")).slice(0, 500);
      const { so, skipped } = await createSalesOrder(u, last.items, { address, po: String(b.po_number || "").slice(0, 50), source: "One-click reorder" });
      u.used_links = [...(u.used_links || []), t.n].slice(-30); await saveUser(u);
      return json(200, { ok: true, order: so.salesorder_number, total: so.total, skipped }, { "Set-Cookie": makeSession(u) });
    }
    if (q.get("t")) {
      const t = readToken(q.get("t")); if (!t || t.p !== "reorder") return json(403, { message: "This reorder link has expired. Please sign in to reorder." });
      const u = await getUser(t.e); if (!u || u.disabled) return json(403, { message: "Account not found." });
      const last = await lastOrder(u); if (!last) return json(404, { message: "We couldn't find your last order." });
      const b = buildLines(last.items, u);
      return json(200, { user: { name: u.name, company: u.company, address: u.last_address || [u.address, u.city, u.state, u.pincode].filter(Boolean).join(", ") },
        last: { number: last.number, date: last.date }, items: b.view, skipped: b.skipped, used: (u.used_links || []).includes(t.n) });
    }
    const u = await sessionUser(req); if (!u) return json(401, { message: "Please sign in." });
    const src = q.get("src") || "last"; let items = [], label = "";
    if (src === "last") { const l = await lastOrder(u); if (l) { items = l.items; label = l.number; } }
    else { const [type, id] = src.split(":"); const d = await ownDoc(u, type, id); if (d) { items = itemsFromDoc(d); label = d.estimate_number || d.salesorder_number || d.invoice_number; } }
    if (!items.length) return json(404, { message: "We couldn't match the items of that order to our current catalogue. Please contact us to reorder." });
    return json(200, { items, from: label });
  } catch (e) { console.error(e); return json(502, { message: "Something went wrong. Please try again or call +91 98840 64464." }); }
};
export const config = { path: "/api/reorder" };
