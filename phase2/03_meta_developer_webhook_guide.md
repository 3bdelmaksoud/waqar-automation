# 🛠️ Developer Guide: Deploying the Free Custom Messenger & Comment Bot
**Backend:** Google Apps Script Web App (`01_messenger_bot.gs`) — **$0/month, free HTTPS, native Google Sheets read/write**

---

## Why Google Apps Script instead of `waqar.runasp.net`?
1. `http://waqar.runasp.net/` currently runs on **HTTP**, and **Meta Webhooks strictly reject non-HTTPS URLs**.
2. Google Apps Script Web Apps give a **free Google-hosted `https://script.google.com/macros/s/.../exec` endpoint**.
3. The bot lives inside the exact same project as Phase 1's Google Sheet (`وقار للاستثمار العقاري`), so it reads `🏠 العقارات` and writes `👥 المشترون` and `🔗 التطابقات` directly with zero extra API glue.

---

## Step 1: Install the Bot Script in Your Google Sheet
1. Open your Phase 1 Google Spreadsheet.
2. Go to **Extensions → Apps Script**.
3. On the left sidebar next to **Files**, click **`+` → Script**.
4. Name the new file `MessengerBot`.
5. Paste the full contents of [`01_messenger_bot.gs`](01_messenger_bot.gs) and press **Save (`Ctrl+S`)**.
6. *(Quick local sanity check)*: Select `testBotSimulation` from the top dropdown and click **Run** (grant permissions if prompted).
   - Check the **`👥 المشترون`** and **`🤖 سجل البوت`** tabs in your spreadsheet — you should see a test buyer (`محمد عادل`) and bot logs created cleanly! *(Delete the test row afterwards.)*

---

## Step 2: Deploy as an HTTPS Web App
1. In the Apps Script editor, click **Deploy → New deployment** (top right).
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Settings:
   - **Description**: `Waqar Messenger Bot v1`
   - **Execute as**: `Me`
   - **Who has access**: **`Anyone`** *(Mandatory so Meta's servers can POST webhooks without Google login)*
4. Click **Deploy**.
5. Copy the **Web app URL** ending in `/exec` — this is your **Callback URL**.

> ⚠️ **Important Apps Script rule**: Whenever you edit code later, choose **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** so the `/exec` URL updates!

---

## Step 3: Create & Connect the Meta Developer App (Free)
1. Go to [developers.facebook.com](https://developers.facebook.com/) → **My Apps → Create App**.
2. Select **Business** (or **Other → Business**).
3. Name it `Waqar Real Estate Bot` and link your Business Portfolio if prompted.
4. On the App Dashboard, click **Add Product → Messenger → Set up**.
5. Under **Messenger API Settings → Access Tokens**:
   - Click **Add or Remove Pages** and connect `facebook.com/Waqar.Realestatee`.
   - Copy the **Page ID** (shown next to the page name).
   - Click **Generate Token**, accept permissions, and copy the **Page Access Token**.

---

## Step 4: Save Tokens Securely in Apps Script
1. Open `MessengerBot.gs` in Apps Script.
2. In `saveBotConfig()` (around line 39), fill in:
   - `VERIFY_TOKEN`: any secret string you choose (e.g. `waqar_alex_verify_2026`)
   - `PAGE_ACCESS_TOKEN`: your generated Meta Page Access Token
   - `PAGE_ID`: your Facebook Page numeric ID
   - `GEMINI_API_KEY`: *(optional)* free API key from [aistudio.google.com](https://aistudio.google.com/) if you want the bot to also understand long free-form Arabic messages outside the button flow.
3. Select `saveBotConfig` in the top dropdown and click **Run**.
4. *(Good hygiene)* Clear the pasted secret strings back to placeholders in the code editor and hit Save — they are now persisted inside Apps Script `PropertiesService`!

---

## Step 5: Connect the Webhook in Meta
1. In Meta App Dashboard → **Messenger API Settings → Webhooks**, click **Add Callback URL**.
2. **Callback URL**: paste your Apps Script `/exec` URL.
3. **Verify Token**: paste the exact `VERIFY_TOKEN` you saved (`waqar_alex_verify_2026`).
4. Click **Verify and Save** — Meta calls `doGet()` and verifies the challenge automatically.
5. Next to your connected Page, click **Add Subscriptions** and enable:
   - `messages` (incoming DMs + Quick Replies)
   - `messaging_postbacks` (Get Started / menu buttons)
   - `feed` (comment-to-DM private replies when someone comments on a Page post!)

*(Optional but great UX)*: Enable Messenger **Get Started** button via a 1-time `curl` or Postman call so new users see an `"ابدأ"` button immediately:
```bash
curl -X POST "https://graph.facebook.com/v21.0/me/messenger_profile?access_token=YOUR_PAGE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"get_started":{"payload":"GET_STARTED"}}'
```

---

## Step 6: Test & Go Public (Meta App Review Note)
- **While your Meta App is in Development Mode**: Only Page Admins / App Developers / App Testers (you and Noura, added under App Roles → Testers) will receive replies from the custom webhook bot.
- Test both flows using your & Noura's personal Facebook accounts:
  1. Message the Page → test `🔑 أبحث عن عقار` → verify row added in `👥 المشترون` + matching properties sent back in Messenger!
  2. Message the Page → test `🏠 لدي عقار للبيع` → verify row added in `🏠 العقارات` with status `جديد`.
  3. Comment `"بكام؟"` on a Page post → verify Private Reply DM arrives automatically!
- **To make the custom bot reply to ALL public Facebook users**:
  - Go to **App Review → Permissions and Features** in Meta Developer Portal.
  - Request Advanced Access for **`pages_messaging`** (and **`pages_manage_metadata`** / **`pages_read_engagement`** for `feed` comment replies) with a quick screen-recording demo of Noura/you testing the bot!
  - Until Meta approves App Review (~few days), keep **Meta Business Suite Automations** (`02_meta_business_suite_free_setup.md`) active so public visitors still get instant responses!

