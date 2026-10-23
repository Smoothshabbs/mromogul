// Forgot password: POST {email} emails a reset link.  POST {t, password} sets the new password.
import crypto from "node:crypto";
import { json, getUser, saveUser, signToken, readToken, hashPassword, makeSession, sendMail, mailLayout, mailButton, esc, SITE, mailReady } from "../lib/core.mjs";
const fp = u => crypto.createHash("sha256").update(u.hash).digest("hex").slice(0, 12); // link stops working once the password changes
export default async (req) => {
  if (req.method !== "POST") return json(405, { message: "Use POST" });
  let b; try { b = await req.json(); } catch { return json(400, { message: "Invalid request" }); }
  if (b.t) {
    const t = readToken(b.t); const u = t && t.p === "reset" ? await getUser(t.e) : null;
    if (!u || u.disabled || t.f !== fp(u)) return json(403, { message: "This reset link has expired or was already used. Please request a new one." });
    if (String(b.password || "").length < 8) return json(400, { message: "Use at least 8 characters.", errors: { password: "Too short" } });
    Object.assign(u, hashPassword(b.password)); await saveUser(u);
    return json(200, { ok: true }, { "Set-Cookie": makeSession(u) });
  }
  if (!mailReady()) return json(503, { message: "Please WhatsApp or call +91 98840 64464 and we will reset your password." });
  const u = await getUser(b.email);
  if (u && !u.disabled) {
    const link = SITE() + "/account/reset/?t=" + signToken({ p: "reset", e: u.email, f: fp(u) }, 1 / 24);
    await sendMail({ to: u.email, name: u.name, subject: "Reset your MRO Mogul password",
      html: mailLayout("Reset your password", `<p>Hello ${esc(u.name)},</p><p>Click the button below to choose a new password. The link works for one hour.</p>${mailButton(link, "Choose a new password")}<p style="font-size:13px;color:#56616D">If you didn't ask for this, ignore this email. Your password stays the same.</p>`) });
  }
  return json(200, { ok: true, message: "If that email has an account, a reset link is on its way. Check your inbox (and spam folder)." });
};
export const config = { path: "/api/password" };
