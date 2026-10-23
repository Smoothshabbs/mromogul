// Customer accepts (or declines) one of their quotations. Acceptance creates a Sales Order in Zoho Books.
import { json, sessionUser, books, ownDoc, itemsFromDoc, crmNote, sendMail, mailLayout, mailButton, esc, inr, SITE, istNow, ymd } from "../lib/core.mjs";
export default async (req) => {
  if (req.method !== "POST") return json(405, { message: "Use POST" });
  const u = await sessionUser(req); if (!u) return json(401, { message: "Please sign in." });
  let b; try { b = await req.json(); } catch { return json(400, { message: "Invalid request" }); }
  const po = String(b.po || "").trim().slice(0, 50), action = b.action === "decline" ? "decline" : "accept";
  try {
    const e = await ownDoc(u, "estimate", b.id); if (!e) return json(404, { message: "Quotation not found." });
    if (/accepted|invoiced/.test(e.status)) return json(409, { message: "This quotation has already been accepted." });
    if (/declined/.test(e.status)) return json(409, { message: "This quotation was declined. Please request a fresh quote." });
    if (e.expiry_date && e.expiry_date < ymd(istNow())) return json(409, { message: "This quotation has expired. Add the items to your cart to get a fresh quote at today's price.", expired: true, items: itemsFromDoc(e) });
    if (e.status === "draft") await books(`/estimates/${e.estimate_id}/status/sent`, { method: "POST" });
    if (action === "decline") {
      await books(`/estimates/${e.estimate_id}/status/declined`, { method: "POST" });
      await crmNote(u, `Quotation ${e.estimate_number} declined`, `${u.name} declined ${e.estimate_number} on mromogul.com. Reason: ${String(b.reason || "not given").slice(0, 300)}`);
      return json(200, { ok: true, status: "declined" });
    }
    await books(`/estimates/${e.estimate_id}/status/accepted`, { method: "POST" });
    await books(`/estimates/${e.estimate_id}/comments`, { method: "POST", body: JSON.stringify({ description: `Accepted online by ${u.name} (${u.email})${po ? ", PO " + po : ""}.`, show_comment_to_clients: false }) }).catch(() => {});
    // Turn the accepted quote into a Sales Order at the quoted prices.
    let so = null;
    if (!/^no$/i.test(process.env.ORDER_ON_ACCEPT || "yes")) {
      const keep = ["item_id", "name", "description", "rate", "quantity", "unit", "tax_id", "hsn_or_sac", "product_type", "discount"];
      const line_items = (e.line_items || []).map(li => Object.fromEntries(keep.filter(k => li[k] !== undefined && li[k] !== "").map(k => [k, li[k]])));
      so = (await books("/salesorders", { method: "POST", body: JSON.stringify({
        customer_id: e.customer_id, date: ymd(istNow()), reference_number: (po || e.estimate_number).slice(0, 50),
        ...(e.place_of_supply ? { place_of_supply: e.place_of_supply } : {}), ...(e.gst_treatment ? { gst_treatment: e.gst_treatment } : {}), ...(e.gst_no ? { gst_no: e.gst_no } : {}),
        is_inclusive_tax: !!e.is_inclusive_tax, line_items, notes: `Against quotation ${e.estimate_number}, accepted online by ${u.name}.${po ? " Customer PO: " + po : ""}`,
        terms: e.terms || "" }) })).salesorder;
    }
    const ref = so ? so.salesorder_number : e.estimate_number;
    await Promise.allSettled([
      crmNote(u, `Quotation ${e.estimate_number} accepted`, `${u.name} accepted ${e.estimate_number} (${inr(e.total)}) on mromogul.com${po ? ", PO " + po : ""}.${so ? " Sales order " + so.salesorder_number + " created." : ""}`),
      sendMail({ to: u.email, name: u.name, bccSales: true, subject: `Quotation ${e.estimate_number} accepted${so ? " – order " + so.salesorder_number : ""}`,
        html: mailLayout(`Thank you. Quotation ${e.estimate_number} is accepted.`, `<p>Hello ${esc(u.name)},</p><p>We have recorded your acceptance of quotation <b>${esc(e.estimate_number)}</b> for <b>${inr(e.total)}</b>${po ? ` against your PO <b>${esc(po)}</b>` : ""}.${so ? ` Your order number is <b>${esc(so.salesorder_number)}</b>.` : ""}</p><p>Our team will confirm dispatch and send the proforma / tax invoice.</p>${mailButton(SITE() + "/account/#orders", "Track your order")}`) })]);
    return json(200, { ok: true, status: "accepted", order: ref });
  } catch (err) { console.error(err); return json(502, { message: "We couldn't record that just now. Please try again or call +91 98840 64464." }); }
};
export const config = { path: "/api/quote-action" };
