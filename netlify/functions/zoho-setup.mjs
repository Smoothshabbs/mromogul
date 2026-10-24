// One-time setup helper.  /api/zoho-setup?key=SETUP_KEY&code=GRANT_CODE  -> refresh token
//                          /api/zoho-setup?key=SETUP_KEY                  -> checks Books + CRM, lists IDs and fields
const ACC = process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.in";
const API = process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.in";
const out = (s, o) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
export default async (req) => {
  const q = new URL(req.url).searchParams;
  if (!process.env.SETUP_KEY || q.get("key") !== process.env.SETUP_KEY) return out(403, { error: "Add a SETUP_KEY environment variable and pass it as ?key=" });
  const cid = encodeURIComponent(process.env.ZOHO_CLIENT_ID || ""), cs = encodeURIComponent(process.env.ZOHO_CLIENT_SECRET || "");
  if (q.get("code")) {
    const r = await (await fetch(`${ACC}/oauth/v2/token?code=${encodeURIComponent(q.get("code"))}&client_id=${cid}&client_secret=${cs}&grant_type=authorization_code`, { method: "POST" })).json();
    if (!r.refresh_token) return out(400, { step: "exchange code", zoho_said: r, hint: "Codes expire quickly and work once. Generate a new one." });
    return out(200, { ZOHO_REFRESH_TOKEN: r.refresh_token, next: "Save this as ZOHO_REFRESH_TOKEN in Netlify, redeploy, then open this page again without &code=" });
  }
  const t = await (await fetch(`${ACC}/oauth/v2/token?refresh_token=${encodeURIComponent(process.env.ZOHO_REFRESH_TOKEN || "")}&client_id=${cid}&client_secret=${cs}&grant_type=refresh_token`, { method: "POST" })).json();
  if (!t.access_token) return out(500, { step: "login", zoho_said: t });
  const H = { Authorization: `Zoho-oauthtoken ${t.access_token}` }, res = { login: "OK" };
  try { const o = await (await fetch(`${API}/books/v3/organizations`, { headers: H })).json(); res.books_organizations = (o.organizations || []).map(x => ({ name: x.name, organization_id: x.organization_id })); } catch (e) { res.books_error = String(e); }
  const org = process.env.ZOHO_ORG_ID || (res.books_organizations || [])[0]?.organization_id;
  if (org) { try { const x = await (await fetch(`${API}/books/v3/settings/taxes?organization_id=${org}`, { headers: H })).json(); res.books_taxes = (x.taxes || []).map(v => ({ tax_id: v.tax_id, name: v.tax_name, percent: v.tax_percentage, type: v.tax_specific_type || v.tax_type })); } catch (e) { res.tax_error = String(e); } }
  for (const m of ["Accounts", "Contacts"]) {
    try { const f = await (await fetch(`${API}/crm/${process.env.ZOHO_CRM_VERSION || "v8"}/settings/fields?module=${m}`, { headers: H })).json();
      if (!f.fields) res[`crm_${m}_error`] = f;
      res[`crm_${m}_custom_fields`] = (f.fields || []).filter(x => x.custom_field).map(x => ({ label: x.field_label, api_name: x.api_name, type: x.data_type, options: (x.pick_list_values || []).map(v => v.display_value) }));
      res[`crm_${m}_gst_or_type_fields`] = (f.fields || []).filter(x => /gst|type/i.test(x.field_label + " " + x.api_name)).map(x => ({ label: x.field_label, api_name: x.api_name, type: x.data_type, custom: !!x.custom_field }));
      res[`crm_${m}_field_count`] = (f.fields || []).length; } catch (e) { res[`crm_${m}_error`] = String(e); }
  }
  res.expected = { gstin_field: process.env.CRM_FIELD_GSTIN || "GSTIN", customer_type_field: process.env.CRM_FIELD_CUSTOMER_TYPE || "Customer_Type",
    hint: "Create these custom fields in Zoho CRM (Accounts: GSTIN, Customer Type; Contacts: Customer Type) or set CRM_FIELD_* to the API names listed above. Use the 18% GST group id for ZOHO_TAX_ID_INTRA and IGST 18% for ZOHO_TAX_ID_INTER." };
  return out(200, res);
};
export const config = { path: "/api/zoho-setup" };
