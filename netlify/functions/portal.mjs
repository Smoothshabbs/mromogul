// Customer account data, live from Zoho Books: quotes, orders, invoices, balance.
import { json, sessionUser, saveUser, zohoReady, books, booksCustomer, num, istNow, ymd } from "../lib/core.mjs";
const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]]));
export default async (req) => {
  const u = await sessionUser(req); if (!u) return json(401, { message: "Please sign in." });
  if (!zohoReady() || !process.env.ZOHO_ORG_ID) return json(200, { ready: false, quotes: [], orders: [], invoices: [] });
  try {
    if (!u.books_contact_id) { await booksCustomer(u, false); if (u.books_contact_id) await saveUser(u); }
    if (!u.books_contact_id) return json(200, { ready: true, linked: false, quotes: [], orders: [], invoices: [], summary: { outstanding: 0, overdue: 0, open_quotes: 0 } });
    const c = u.books_contact_id, q = "&sort_column=date&sort_order=D&per_page=50";
    const [e, s, i, ct] = await Promise.all([
      books(`/estimates?customer_id=${c}${q}`).catch(() => ({})), books(`/salesorders?customer_id=${c}${q}`).catch(() => ({})),
      books(`/invoices?customer_id=${c}${q}`).catch(() => ({})), books(`/contacts/${c}`).catch(() => ({}))]);
    const today = ymd(istNow());
    const quotes = (e.estimates || []).filter(x => x.status !== "draft").map(x => ({ ...pick(x, ["estimate_id", "estimate_number", "reference_number", "date", "expiry_date", "total", "status"]),
      expired: !!(x.expiry_date && x.expiry_date < today && /sent|draft/.test(x.status)) }));
    const orders = (s.salesorders || []).filter(x => x.status !== "void").map(x => pick(x, ["salesorder_id", "salesorder_number", "reference_number", "date", "total", "status", "order_status", "invoiced_status", "shipped_status"]));
    const invoices = (i.invoices || []).filter(x => !/void|draft/.test(x.status)).map(x => pick(x, ["invoice_id", "invoice_number", "reference_number", "date", "due_date", "total", "balance", "status"]));
    const pend = invoices.filter(x => num(x.balance) > 0);
    const contact = ct.contact || {};
    return json(200, { ready: true, linked: true, quotes, orders, invoices,
      summary: { outstanding: contact.outstanding_receivable_amount ?? pend.reduce((a, x) => a + num(x.balance), 0),
        overdue: pend.filter(x => x.status === "overdue" || (x.due_date && x.due_date < today)).reduce((a, x) => a + num(x.balance), 0),
        unpaid_count: pend.length, open_quotes: quotes.filter(x => x.status === "sent" && !x.expired).length,
        credit_limit: contact.credit_limit || null, payment_terms: contact.payment_terms_label || null } });
  } catch (err) { console.error(err); return json(502, { message: "We couldn't load your account from our accounting system. Please try again shortly." }); }
};
export const config = { path: "/api/portal" };
