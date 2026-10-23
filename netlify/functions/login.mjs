import { json, getUser, checkPassword, makeSession, publicProfile } from "../lib/core.mjs";
export default async (req) => {
  if (req.method !== "POST") return json(405, { message: "Use POST" });
  let b; try { b = await req.json(); } catch { return json(400, { message: "Invalid request" }); }
  const u = await getUser(b.email);
  if (!u || u.disabled || !checkPassword(b.password || "", u)) return json(401, { message: "Email or password is incorrect." });
  return json(200, { ok: true, user: publicProfile(u) }, { "Set-Cookie": makeSession(u) });
};
export const config = { path: "/api/login" };
