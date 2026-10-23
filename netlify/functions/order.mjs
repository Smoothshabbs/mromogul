// Place an order from the cart: creates a Sales Order in Zoho Books and emails the customer and sales team.
import { json, sessionUser, zohoReady, createSalesOrder } from "../lib/core.mjs";
const S = (v, n = 500) => String(v ?? "").trim().slice(0, n);
export default async (req) => {
  if (req.method !== "POST") return json(405, { message: "Use POST" });
  const u = await sessionUser(req); if (!u) return json(401, { message: "Please sign in to place an order." });
  if (!zohoReady() || !process.env.ZOHO_ORG_ID) return json(503, { message: "Online ordering is temporarily unavailable. Please WhatsApp or call +91 98840 64464." });
  let b; try { b = await req.json(); } catch { return json(400, { message: "Invalid request" }); }
  const address = S(b.delivery_address); if (!address) return json(400, { message: "Please enter the delivery address.", errors: { delivery_address: "Required" } });
  try {
    const { so, skipped } = await createSalesOrder(u, b.items, { po: S(b.po_number, 50), address, notes: S(b.notes, 1000) });
    return json(200, { ok: true, order: so.salesorder_number, total: so.total, skipped });
  } catch (e) {
    if (e.code === 400) return json(400, { message: "None of these items can be ordered online right now. Please contact us." });
    console.error(e); return json(502, { message: "We couldn't place the order just now. Please try again or WhatsApp +91 98840 64464." });
  }
};
export const config = { path: "/api/order" };
