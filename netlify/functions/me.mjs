import { json, sessionUser, publicProfile } from "../lib/core.mjs";
export default async (req) => { const u = await sessionUser(req); return u ? json(200, { user: publicProfile(u) }) : json(200, { user: null }); };
export const config = { path: "/api/me" };
