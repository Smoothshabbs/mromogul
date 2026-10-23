// Download the official PDF of one of the customer's own quotes, orders or invoices.
import { json, sessionUser, ownDoc, docPdf } from "../lib/core.mjs";
const NAME = { estimate: ["Quotation", "estimate_number"], salesorder: ["Order", "salesorder_number"], invoice: ["Invoice", "invoice_number"] };
export default async (req) => {
  const u = await sessionUser(req); if (!u) return json(401, { message: "Please sign in." });
  const q = new URL(req.url).searchParams, type = q.get("type"), id = q.get("id");
  if (!NAME[type]) return json(400, { message: "Unknown document" });
  try {
    const d = await ownDoc(u, type, id); if (!d) return json(404, { message: "Document not found." });
    const buf = await docPdf(type, id), fn = `MROMogul-${NAME[type][0]}-${d[NAME[type][1]]}.pdf`;
    return new Response(buf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${q.get("view") ? "inline" : "attachment"}; filename="${fn}"`, "Cache-Control": "no-store" } });
  } catch (e) { console.error(e); return json(502, { message: "Couldn't fetch the document. Please try again." }); }
};
export const config = { path: "/api/doc" };
