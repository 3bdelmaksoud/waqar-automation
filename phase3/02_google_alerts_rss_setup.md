# 🌐 Automated Free Platform Fetching via Google Alerts RSS
**Track B (100% Free, Zero Cloudflare Blocks, Zero Scraping ToS Risk)**

---

## Why Google Alerts RSS Instead of `=IMPORTXML()`?
Modern Egyptian real estate portals (Dubizzle/OLX Egypt, Aqarmap, Property Finder, Facebook) use heavy client-side JavaScript and Cloudflare anti-bot protection, which causes Google Sheets `=IMPORTXML()` formulas to return `#N/A` errors.

Instead, **Google Alerts RSS feeds** are official Google Atom XML feeds that Apps Script (`m3_importGoogleAlertsRss`) parses reliably every 6 hours and inserts straight into **`🌐 جلب العقارات (خارجي)`**.

---

## Step 1: Create 4 Free RSS Alerts (5 minutes)

1. Go to [google.com/alerts](https://www.google.com/alerts) while signed in to the same Google account.
2. Create these 4 alerts one by one. For each alert, click **Show options** and set:
   - **How often:** `As-it-happens`
   - **Language:** `Arabic`
   - **Region:** `Egypt`
   - **How many:** `All results`
   - **Deliver to:** **`RSS feed`** *(Critical — do not choose email!)*

### Recommended Queries for Alexandria Resale Inventory
1. **Apartments (Apartments on Aqarmap / Dubizzle / Web):**
   `("شقة للبيع" OR "شقة تمليك") ("الإسكندرية" OR "اسكندرية") ("سموحة" OR "سيدي جابر" OR "سبورتنج" OR "روشدي" OR "ميامي")`
2. **Portal-Targeted Dubizzle/Aqarmap Feed:**
   `(site:aqarmap.com.eg OR site:dubizzle.com.eg) ("الإسكندرية" OR "Alexandria") ("للبيع")`
3. **Commercial Stores (محلات تجارية):**
   `("محل للبيع" OR "محل تجاري") ("الإسكندرية" OR "اسكندرية")`
4. **Lands (أراضي):**
   `("أرض للبيع" OR "قطعة أرض") ("الإسكندرية" OR "اسكندرية" OR "برج العرب")`

---

## Step 2: Copy the RSS Feed Links

1. After creating each alert, click the **orange RSS icon** next to the alert in [google.com/alerts](https://www.google.com/alerts).
2. Copy the URL (it looks like `https://www.google.com/alerts/feeds/1234567890/987654321`).

---

## Step 3: Save RSS URLs into Apps Script

1. Open your Google Sheet → **Extensions → Apps Script → Project Settings (gear icon) → Script Properties**.
2. Add property:
   - **Property:** `GOOGLE_ALERTS_RSS_URLS`
   - **Value:** paste all 4 RSS feed URLs separated by commas:
     `https://www.google.com/alerts/feeds/.../111, https://www.google.com/alerts/feeds/.../222`
3. Click **Save script properties**.

*(Alternatively, add a row in your `⚙️ الإعدادات` sheet with column A = `روابط Google Alerts` and column B = the comma-separated URLs.)*

---

## What Happens Automatically Next
- Every 6 hours (`m3_dailyAutomationJob`), `m3_importGoogleAlertsRss()` pulls new entries, unwraps the target URL, detects platform + unit type + Alexandria district + price + area + phone number if present in the snippet, deduplicates against previously fetched URLs, and appends them to **`🌐 جلب العقارات (خارجي)`**.
- Noura sees a ready **`📩 إرسال رسالة تواصل`** link in column K to contact the seller directly on WhatsApp!

