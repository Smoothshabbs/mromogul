# MRO Mogul – mromogul.com

The online store for MRO Mogul, a unit of Accelfast Industrial Enterprises, Chennai.

Netlify **builds the website automatically** every time a file in this repository changes. You edit spreadsheets (CSV files) and photos; you never edit web pages by hand.

## What's in here
| Folder / file | What it is | Do you edit it? |
|---|---|---|
| `data/products.csv` | Every size and part number with its **prices**, stock status, HSN and GST. Private: never published. | **Yes**, for prices and new sizes |
| `data/product-info.csv` | One row per product: name, brand, category, descriptions and features. | **Yes**, when adding products |
| `images/products/` | Product photos, one per product. | **Yes**, to add or replace photos |
| `content/blog/` | Blog posts and updates, one file per post. | **Yes**, to publish posts |
| `data/site.json` | Categories (buying guides, FAQs), brand introductions, home-page picks and company details such as the GSTIN. | Occasionally |
| `site/` | The page generator, styles and scripts. | No |
| `netlify/` | Sign-in, prices, quotations, orders, account pages, reminder emails and the Zoho connection. | No |
| `netlify.toml`, `package.json`, `requirements.txt` | Netlify settings. | No |

## 1. Go live
Accounts, quotes and orders need server functions, so the site must be deployed from GitHub. Drag-and-drop on Netlify won't run them.
1. Create a **private** GitHub repository called `mromogul`, then upload the contents of this folder.
   - The web uploader takes 100 files at a time. Upload `images/` on its own first, then everything else.
   - Alternatively, use GitHub Desktop and upload everything in one go.
2. In Netlify, go to **Add new site → Import an existing project → GitHub → mromogul**. The build settings are read from `netlify.toml` automatically, so just click **Deploy**.
3. In **Site configuration → Environment variables**, add the variables in section 4 below, then go to **Deploys → Trigger deploy**.
4. Under **Domain management**, add `mromogul.com`.

## 2. Products and prices
**Change a price:**
1. Open `data/products.csv` on GitHub and click the pencil icon. You can also download it, edit it in Excel and upload it again.
2. Change the price and click **Commit changes**. The site updates in about 2 minutes.
- `selling_price` is the price End Users see. `mrp` is for reference.
- `reseller_price` is optional. When filled in, Resellers see this price instead.
- `gst_included`: `yes` means the price already includes GST (as on MRP lists). `no` means GST is added on top.
- `stock_status` can be `in_stock`, `on_request`, `out_of_stock` (cannot be ordered) or `hidden` (removed from the site).

**Add a new size** of an existing product: add a row to `products.csv` with the same `product_id`.

**Add a new product:**
1. **Product details:** add one row to `data/product-info.csv`.
   - `product_id`: a short name with no spaces, such as `karam-cut-resistant-gloves`.
   - `name`, `brand` and `category`.
   - `category` must be one of `spanners, pliers, screwdrivers, sockets, hexkeys, hammers, measuring, cutting, storage, workshop, pneumatics, airtools, brass, taps`. You can also use a new word, which creates a new category.
   - `short_description`: one or two sentences.
   - `overview`: a longer paragraph.
   - `features`: separate each feature with `|`, for example `Cut level 5 | Nitrile palm | Sizes 9-10`.
   - `featured`: `yes` or `no`.
   - `display_order`: a number; lower numbers appear first.
2. **Sizes and prices:** add one row per size to `data/products.csv`, using the same `product_id`. Each row needs a unique part number in `sku`.
3. **Photo:** upload it to `images/products/` named `<product_id>.jpg`. The build crops and centres it automatically. Use a white background, ideally 800×800 px or larger. If there is no photo, a "Photo coming soon" image is shown.

Commit the changes. Netlify then builds the full product page with specs, FAQs and SEO tags, and adds it to the brand, category, search and sitemap pages.
- A **new brand** gets its own brand page automatically. To give it a proper introduction, add it to the `brands` list in `data/site.json`.
- A **new category** works straight away. Add it to `categories` in `data/site.json` to give it a description, buying guide and FAQs.
- If something is missing, Netlify's **deploy log** shows a `WARNING` line saying what to fix.

## Blog & Updates: writing a post
Posts live in `content/blog/`. Each post is one text file ending in `.md`.

**To add a post on GitHub:**
1. Open `content/blog/`, then open `_template.md` and copy all its text.
2. Go back to `content/blog/` and click **Add file → Create new file**.
3. Name the file with the date and a few words, for example `2026-11-01-frl-maintenance-tips.md`. The words after the date become the web address: `mromogul.com/blog/frl-maintenance-tips/`.
4. Paste the template, fill in the top section, and write the post below it.
   - `type`: `Guide` (how-to and buying advice), `Update` (company news) or `News` (new products and brands).
   - `products`: optional. List `product_id`s from `product-info.csv`, separated by commas. They appear as product cards under the post.
   - `image`: optional. Upload a photo to `images/blog/` and put its file name here. Without one, the first product's photo is used.
   - Delete the line `draft: yes`, or the post stays hidden.
5. Click **Commit changes**. The post appears on the Blog page, on the home page ("Guides from our team") and in the sitemap within about 2 minutes.

**Formatting:**
- `## Heading` for a heading
- `- item` for a bullet list
- `**bold**` for bold text
- `[text](/products/)` for a link
- Leave a blank line between paragraphs. Tables work too (see the template).

**Scheduling:** a post with a future date stays hidden until that date. It appears on the first deploy on or after that day, and any later edit to the site triggers a deploy.

## 3. Customer accounts: what customers get
| Feature | Where the data comes from |
|---|---|
| Sign in, register (Reseller / End user), forgot password | Website database (Netlify Blobs) + Zoho CRM |
| Prices (Reseller or End-user list) | `data/products.csv` |
| "Download Official PDF quote instantly" | Creates an **Estimate** in Zoho Books (marked *Sent*) and downloads Books' own PDF |
| **Quotations** tab: every quote for their company, including ones your team makes in Books, with **Accept** (with optional PO number) | Zoho Books estimates. Accepting marks the estimate *Accepted* and creates a **Sales Order** at the quoted prices |
| **Orders** tab: order status, PDF, "Buy again" | Zoho Books sales orders |
| **Invoices & statement**: pending invoices, overdue warning, invoice PDFs, **statement of account** PDF for any date range | Zoho Books invoices and customer statement |
| **Place order** from the cart | Creates a Sales Order in Zoho Books and emails the customer, with a copy to your sales team |
| **Buy again**: reorder any past order, invoice or quote; items go into the cart at today's prices | Matches part numbers on the Books document |
| **Reorder reminders**: the customer chooses 7–90 days after each order. The email has a **"Reorder same as last time"** button that places the order in one click (14-day secure link, single use), plus an unsubscribe link | Sent daily at about 9:30 AM IST |

**Where login details are stored:**
- Logins live in **Netlify Blobs**, a private database attached to your Netlify site. You can see them under Netlify → your site → **Blobs → mm-users**.
- Passwords are stored only as a one-way **scrypt hash**, so nobody can read them.
- Company details are also copied to **Zoho CRM**.
- To export the customer list:
  `curl -X POST https://mromogul.com/api/admin-user -d '{"key":"YOUR_ADMIN_KEY","action":"list"}'`
- Other admin actions are `reset` (with `"email"` and `"password"`), `disable`, `enable` and `resync` (re-sends the profile to CRM).

> **"Buy again" and reminders** work on orders whose lines carry our part numbers. Website orders always do. For orders your team creates in Books, either use Books **Items** whose SKU equals our part number, or put `Part no: <sku>` in the line description.

## 4. Environment variables (Netlify → Site configuration → Environment variables)
| Name | Value |
|---|---|
| `SESSION_SECRET` | Any long random text (40+ characters). Keeps logins and email links secure. |
| `ADMIN_KEY` | A password of your choice, for the admin commands above. |
| `SETUP_KEY` | A password of your choice, for the one-time Zoho setup page. |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` | See section 5. |
| `ZOHO_ORG_ID` | Your Zoho Books organisation ID. |
| `ZOHO_TAX_ID_INTRA` | Tax ID of the **GST 18%** group (CGST+SGST), for Tamil Nadu customers. |
| `ZOHO_TAX_ID_INTER` | Tax ID of **IGST 18%**, for customers outside Tamil Nadu. |
| `ZEPTO_TOKEN` | The ZeptoMail "Send Mail token" (section 6). |
| `MAIL_FROM` | `orders@mromogul.com`, the sender address customers see. |
| `MAIL_SALES` | `sales@mromogul.com`. Gets a copy of every order and accepted quote. When customers reply to an email, the reply goes here too. |
| `MAIL_ACCOUNTS` | `accounts@mromogul.com`. Gets statement requests that couldn't be generated automatically. |
| Optional | `MAIL_FROM_NAME` (default "MRO Mogul"), `MAIL_REPLY_TO` (replies go to `MAIL_SALES` unless you set this), `QUOTE_VALID_DAYS` (default 15), `ORDER_ON_ACCEPT` (`no` = accepting a quote does not create a sales order), `CRM_FIELD_GSTIN`, `CRM_FIELD_CUSTOMER_TYPE`, `CRM_LEAD_SOURCE`, `QUOTE_TERMS`, `ORDER_TERMS` |

## 5. Connect Zoho (one time)
1. **Zoho CRM:**
   - Go to Setup → Modules and Fields → **Accounts**. Add a single-line field **GSTIN** and a pick-list **Customer Type** with the values `Reseller` and `End User`.
   - In **Contacts**, add the same **Customer Type** pick-list.
2. **Zoho Books:**
   - Go to Settings → Integrations → **Zoho CRM** and sync Accounts and Contacts.
   - Make sure **Sales Orders** are enabled in Settings → Preferences.
3. Go to https://api-console.zoho.in.
   - Choose **Self Client** and copy the Client ID and Secret into Netlify.
   - In **Generate Code**, paste this scope, choose 10 minutes and click Create:
     `ZohoBooks.contacts.ALL,ZohoBooks.estimates.ALL,ZohoBooks.salesorders.ALL,ZohoBooks.invoices.READ,ZohoBooks.settings.READ,ZohoCRM.modules.ALL,ZohoCRM.settings.fields.READ`
4. Within those 10 minutes, open `https://mromogul.com/api/zoho-setup?key=YOUR_SETUP_KEY&code=THE_CODE`. Copy the `ZOHO_REFRESH_TOKEN` it shows into Netlify, then redeploy.
5. Open `https://mromogul.com/api/zoho-setup?key=YOUR_SETUP_KEY`.
   - It lists your organisation ID, tax IDs and CRM field names.
   - Fill in `ZOHO_ORG_ID`, `ZOHO_TAX_ID_INTRA` and `ZOHO_TAX_ID_INTER`, then redeploy.
6. **Test with your own account:**
   - Register, download a quote, then accept it.
   - Place an order, then check the Invoices tab.
   - Download a statement. If the statement can't be generated automatically, the customer sees a message and an email request goes to `MAIL_SALES`.

## 6. Emails (Zoho ZeptoMail)
Order confirmations, password resets and reorder reminders are sent through **Zoho ZeptoMail**. It's Zoho's transactional email service; the India data centre is zeptomail.in and it is pay-as-you-go.
1. Sign up at https://www.zoho.in/zeptomail/ and add the domain `mromogul.com`.
2. Add the DNS records it shows in **GoDaddy → DNS**, then wait for them to verify. If it asks for an SPF value and you already have an SPF record (from your mailbox provider), add it to that record. Never create a second SPF record.
3. Create a Mail Agent. Under **SMTP & API → API**, copy the **Send Mail token** into `ZEPTO_TOKEN`. Set `MAIL_FROM` to `orders@mromogul.com`, `MAIL_SALES` to `sales@mromogul.com` and `MAIL_ACCOUNTS` to `accounts@mromogul.com`.

Until this is set up, the site works fully but sends no emails. The reminder setting is saved and starts working once email is on.

## 7. To fill in later
- **Logo:** replace the files in `site/static/img/` (`favicon.png`, `apple-touch-icon.png`, `og-image.jpg`).
- **Accelfast GSTIN:** add it in `data/site.json` → `company.gstin`. It then appears on the site as a trust signal.
