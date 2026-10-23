// Account preferences: reorder reminder frequency, change password; one-click unsubscribe from reminder emails.
import { json, sessionUser, getUser, saveUser, readToken, checkPassword, hashPassword, publicProfile, SITE } from "../lib/core.mjs";
const DAYS = [0, 7, 15, 30, 45, 60, 90];
export default async (req) => {
  const q = new URL(req.url).searchParams;
  if (q.get("unsub")) {
    const t = readToken(q.get("unsub")); const u = t && t.p === "unsub" ? await getUser(t.e) : null;
    if (u) { u.reminder_days = 0; await saveUser(u); }
    return new Response(null, { status: 302, headers: { Location: SITE() + "/account/?unsubscribed=" + (u ? "1" : "0") } });
  }
  if (req.method !== "POST") return json(405, { message: "Use POST" });
  const u = await sessionUser(req); if (!u) return json(401, { message: "Please sign in." });
  let b; try { b = await req.json(); } catch { return json(400, { message: "Invalid request" }); }
  if (b.reminder_days !== undefined) {
    const d = parseInt(b.reminder_days, 10); if (!DAYS.includes(d)) return json(400, { message: "Choose a valid interval." });
    u.reminder_days = d; delete u.last_reminder;
  }
  if (b.new_password !== undefined) {
    if (!checkPassword(b.old_password || "", u)) return json(400, { message: "Your current password is incorrect.", errors: { old_password: "Incorrect" } });
    if (String(b.new_password).length < 8) return json(400, { message: "Use at least 8 characters.", errors: { new_password: "Too short" } });
    Object.assign(u, hashPassword(b.new_password));
  }
  await saveUser(u); return json(200, { ok: true, user: publicProfile(u) });
};
export const config = { path: "/api/prefs" };
