import { json, getUser, saveUser, hashPassword, makeSession, publicProfile, zohoReady, syncCRM } from "../lib/core.mjs";
const S = v => String(v ?? "").trim().slice(0, 300);
export default async (req) => {
  if (req.method !== "POST") return json(405, { message: "Use POST" });
  let b; try { b = await req.json(); } catch { return json(400, { message: "Invalid request" }); }
  if (b.website) return json(400, { message: "Rejected" });
  const u = { name: S(b.name), company: S(b.company), email: S(b.email).toLowerCase(), phone: S(b.phone).replace(/[^\d+]/g, ""),
    gstin: S(b.gstin).toUpperCase(), customer_type: /reseller/i.test(b.customer_type) ? "Reseller" : "End User",
    address: S(b.address), city: S(b.city), state: S(b.state), pincode: S(b.pincode), created: new Date().toISOString() };
  const err = {};
  if (!u.name) err.name = "Enter your name.";
  if (!/^\S+@\S+\.\S+$/.test(u.email)) err.email = "Enter a valid email address.";
  if (u.phone.replace(/\D/g, "").length < 10) err.phone = "Enter a 10-digit mobile number.";
  if (!b.customer_type) err.customer_type = "Tell us if you are a reseller or an end user.";
  if (u.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(u.gstin)) err.gstin = "GSTIN should be 15 characters.";
  if (String(b.password || "").length < 8) err.password = "Use at least 8 characters.";
  if (!u.company && u.customer_type === "Reseller") err.company = "Enter your business name.";
  if (Object.keys(err).length) return json(400, { message: "Please check the highlighted fields.", errors: err });
  if (await getUser(u.email)) return json(409, { message: "An account with this email already exists. Please sign in.", errors: { email: "Already registered." } });
  Object.assign(u, hashPassword(b.password));
  if (zohoReady()) { try { await syncCRM(u); } catch (e) { console.error(e); u.crm_error = String(e.message || e).slice(0, 300); } }
  await saveUser(u);
  return json(200, { ok: true, user: publicProfile(u) }, { "Set-Cookie": makeSession(u) });
};
export const config = { path: "/api/register" };
