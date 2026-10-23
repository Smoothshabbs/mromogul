import { json, clearSession } from "../lib/core.mjs";
export default async () => json(200, { ok: true }, { "Set-Cookie": clearSession() });
export const config = { path: "/api/logout" };
