// Official quotation: CRM profile -> Zoho Books customer -> Books estimate (marked Sent) -> Zoho's own PDF.
import { json, sessionUser, saveUser, zohoReady, syncCRM, books, buildLines, booksCustomer, crmNote, istNow, ymd, inr } from "../lib/core.mjs";
export default async (req) => {
  if (req.method !== "POST") return json(405, { message: "Use POST" });
  const u = await sessionUser(req);
  if (!u) return json(401, { message: "Please sign in to download an official quotation." });
  if (!zohoReady() || !process.env.ZOHO_ORG_ID) return json(503, { message: "Quotations are temporarily unavailable. Please call +91 98840 64464." });
  let b; try { b = await req.json(); } catch { return json(400, { message: "Invalid request" }); }
  const { lines, place_of_supply: st } = buildLines(Array.isArray(b.items) ? b.items : [], u);
  if (!lines.length) return json(400, { message: "Your cart is empty." });
  try {
    if (!u.crm_account_id) { try { await syncCRM(u); } catch (e) { u.crm_error = String(e.message || e).slice(0, 300); } }
    await booksCustomer(u); await saveUser(u);
    const today = istNow(), exp = new Date(today.getTime() + (parseInt(process.env.QUOTE_VALID_DAYS, 10) || 15) * 864e5);
    const e = (await books("/estimates", { method: "POST", body: JSON.stringify({
      customer_id: u.books_contact_id, date: ymd(today), expiry_date: ymd(exp),
      reference_number: "WEB-" + ymd(today).replace(/-/g, "") + "-" + String(Date.now()).slice(-5),
      ...(st ? { place_of_supply: st } : {}), gst_treatment: u.gstin ? "business_gst" : "consumer", ...(u.gstin ? { gst_no: u.gstin } : {}),
      is_inclusive_tax: false, line_items: lines,
      notes: process.env.QUOTE_NOTES || `Quotation requested on mromogul.com by ${u.name} (${u.customer_type}).`,
      terms: process.env.QUOTE_TERMS || "Prices valid until the expiry date. Freight extra unless stated. Payment: 100% advance by bank transfer / UPI against proforma invoice." }) })).estimate;
    // An issued quote is "Sent" so the customer can accept it from their account.
    await books(`/estimates/${e.estimate_id}/status/sent`, { method: "POST" }).catch(err => console.error("mark sent", err));
    const pdf = await books(`/estimates/${e.estimate_id}?accept=pdf`, { raw: true, headers: { Accept: "application/pdf" } });
    const buf = Buffer.from(await pdf.arrayBuffer());
    await crmNote(u, `Web quotation ${e.estimate_number}`, `${u.name} downloaded quotation ${e.estimate_number} (${lines.length} items, total ${inr(e.total)}) from mromogul.com.`).catch(() => {});
    return new Response(buf, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="MROMogul-Quotation-${e.estimate_number}.pdf"`, "X-Quote-Number": e.estimate_number, "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return json(502, { message: "We couldn't generate your official quotation just now. Please try again in a minute or call +91 98840 64464." });
  }
};
export const config = { path: "/api/quote" };
