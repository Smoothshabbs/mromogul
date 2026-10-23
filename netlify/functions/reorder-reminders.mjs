// Runs every day at about 9:30 AM IST. Emails customers whose chosen reorder interval has passed since their last order,
// with a one-click "reorder same as last time" button.
import { allUsers, saveUser, lastOrder, buildLines, signToken, sendMail, mailLayout, mailButton, mailItems, esc, inr, SITE, zohoReady, mailReady, istNow, ymd } from "../lib/core.mjs";
export default async () => {
  if (!zohoReady() || !mailReady()) { console.log("reminders: Zoho or email not configured"); return; }
  const today = istNow(), users = (await allUsers()).filter(u => u.reminder_days > 0 && !u.disabled && u.books_contact_id);
  let sent = 0;
  for (const u of users) {
    if (sent >= 40) break; // stay well inside the time limit; the rest go tomorrow
    try {
      const last = await lastOrder(u); if (!last) continue;
      const due = new Date(new Date(last.date + "T00:00:00Z").getTime() + u.reminder_days * 864e5);
      if (today < due) continue;
      if (u.last_reminder && u.last_reminder_for === last.number) continue; // one reminder per order
      const b = buildLines(last.items, u); if (!b.view.length) continue;
      const n = Math.random().toString(36).slice(2, 10);
      const reorder = SITE() + "/reorder/?t=" + signToken({ p: "reorder", e: u.email, n }, 14);
      const unsub = SITE() + "/api/prefs?unsub=" + signToken({ p: "unsub", e: u.email }, 365);
      const value = b.view.reduce((a, i) => a + i.rate * i.qty * (i.gst_included ? 1 : 1 + i.gst / 100), 0);
      const ok = await sendMail({ to: u.email, name: u.name, subject: `Time to restock? Reorder ${last.number} in one click`,
        html: mailLayout(`Time to restock, ${u.name.split(" ")[0]}?`,
          `<p>It has been ${Math.round((today - new Date(last.date)) / 864e5)} days since your last order <b>${esc(last.number)}</b> (${esc(last.date)}). Here is what you ordered:</p>${mailItems(b.view)}
           <p style="margin-top:12px">Estimated value at today's prices: <b>${inr(Math.round(value))}</b> incl. GST, before freight.</p>
           ${mailButton(reorder, "Reorder same as last time")}
           <p style="font-size:13px">Want to change quantities? <a href="${SITE()}/account/#reorder">Open your account</a> and use “Buy again”.</p>
           <p style="font-size:12px;color:#56616D">You get this reminder every ${u.reminder_days} days after an order. <a href="${unsub}">Stop these reminders</a>.</p>`) });
      if (ok) { u.last_reminder = ymd(today); u.last_reminder_for = last.number; await saveUser(u); sent++; }
    } catch (e) { console.error("reminder", u.email, e); }
  }
  console.log("reminders sent", sent);
};
export const config = { schedule: "0 4 * * *" };
