// Staff tool: reset a password, disable/enable an account, or re-sync to CRM.
// POST /api/admin-user  {key, email, action:"list"|"reset"|"disable"|"enable"|"resync", password}
import { json, allUsers, getUser, saveUser, hashPassword, syncCRM, publicProfile } from "../lib/core.mjs";
export default async (req) => {
  let b; try { b = await req.json(); } catch { return json(400, { message: "Invalid request" }); }
  if (!process.env.ADMIN_KEY || b.key !== process.env.ADMIN_KEY) return json(403, { message: "Forbidden" });
  if (b.action === "list") return json(200, { users: (await allUsers()).map(u => ({ ...publicProfile(u), created: u.created, disabled: !!u.disabled, crm_account_id: u.crm_account_id || null, books_contact_id: u.books_contact_id || null, crm_error: u.crm_error || null })) });
  const u = await getUser(b.email); if (!u) return json(404, { message: "No such user" });
  if (b.action === "reset") { if (String(b.password || "").length < 8) return json(400, { message: "Password too short" }); Object.assign(u, hashPassword(b.password)); }
  else if (b.action === "disable") u.disabled = true;
  else if (b.action === "enable") delete u.disabled;
  else if (b.action === "resync") await syncCRM(u);
  else return json(400, { message: "Unknown action" });
  await saveUser(u); return json(200, { ok: true, user: publicProfile(u), crm_error: u.crm_error || null });
};
export const config = { path: "/api/admin-user" };
