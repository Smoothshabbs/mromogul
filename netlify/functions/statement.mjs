// Statement of account PDF from Zoho Books for a date range.
import { json, sessionUser, books, istNow, ymd, sendMail, mailLayout, esc } from "../lib/core.mjs";
const D = /^\d{4}-\d{2}-\d{2}$/;
export default async (req) => {
  const u = await sessionUser(req); if (!u) return json(401, { message: "Please sign in." });
  if (!u.books_contact_id) return json(404, { message: "No transactions yet. Your statement will be available after your first invoice." });
  const q = new URL(req.url).searchParams, now = istNow();
  const fyStart = `${now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1}-04-01`;
  const from = D.test(q.get("from") || "") ? q.get("from") : fyStart, to = D.test(q.get("to") || "") ? q.get("to") : ymd(now);
  try {
    const r = await books(`/contacts/${u.books_contact_id}/statements?start_date=${from}&end_date=${to}&from_date=${from}&to_date=${to}&filter_by=Status.All&accept=pdf`,
      { raw: true, headers: { Accept: "application/pdf" } });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.slice(0, 4).toString() !== "%PDF") throw new Error("Statement was not a PDF: " + buf.slice(0, 120).toString());
    return new Response(buf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="MROMogul-Statement-${from}-to-${to}.pdf"`, "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    if (process.env.MAIL_SALES) await sendMail({ to: process.env.MAIL_SALES, subject: `Statement request: ${u.company || u.name}`,
      html: mailLayout("Customer requested a statement", `<p>${esc(u.company || u.name)} (${esc(u.email)}) asked for a statement from ${from} to ${to}, but it could not be generated automatically. Please email it from Zoho Books.</p>`) }).catch(() => {});
    return json(502, { message: "We couldn't generate the statement automatically. Our accounts team has been notified and will email it to you." });
  }
};
export const config = { path: "/api/statement" };
