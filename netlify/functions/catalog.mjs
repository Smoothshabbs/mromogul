// Public catalogue fields for everyone; prices only for signed-in customers.
import { json, products, sessionUser, priceFor, num } from "../lib/core.mjs";
const PUBLIC = ["sku","product_id","product_name","brand","category","variant","gst_included","gst_rate","min_order_qty","std_pack","stock_status","hsn","image","featured","sort_order","description"];
export default async (req) => {
  const u = await sessionUser(req);
  const rows = products().filter(r => r.sku && r.product_id && !/hidden/i.test(r.stock_status)).map(r => {
    const o = Object.fromEntries(PUBLIC.map(k => [k, r[k] || ""]));
    if (u) { o.price = priceFor(r, u); o.mrp = num(r.mrp); }
    return o;
  });
  return json(200, { signed_in: !!u, customer_type: u ? u.customer_type : null, rows });
};
export const config = { path: "/api/catalog" };
