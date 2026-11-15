# 🎯 Phase 3 Developer Setup Guide — Matching Engine, Dedup & Follow-Ups

**Cost:** $0 | **Files:** [`01_matching_engine.gs`](01_matching_engine.gs) + updated [`onOpen()` in `01_setup_database.gs`](../phase1/01_setup_database.gs)

---

## What Phase 3 Adds

1. **Weighted Buyer ↔ Property Matching Engine (`m3_scorePair_`):**
   - Reads weights (`35%` budget, `30%` location, `20%` type & size, `10%` payment, `5%` must-haves) and `Hot (≥85%)` / `Warm (≥60%)` thresholds dynamically from **`⚙️ الإعدادات`**.
   - **Hard Compatibility Filters:** Prevents matching apartments to land/store buyers, and rejects listings >35% over buyer max budget.
   - **Alexandria Neighbor Clustering (`M3_ALEX_NEIGHBORS`):** Gives full location points for exact district match, `60%` of location weight for adjacent Alexandria neighborhoods (e.g. Smouha ↔ Sidi Gaber / Kafr Abdo / Sporting), and `35%` for same tier (`Prime` / `Mid` / `Suburban`).
2. **Cross-Source Duplicate Detector (`m3_checkDuplicates`):**
   - Scans both `🏠 العقارات` and `🌐 جلب العقارات (خارجي)` for matching seller phones or matching `(district + unit type + area ±5% + price ±5%)` and flags external duplicates as `مكرر 🔁`.
3. **Action Queue Sheet (`🔥 تنبيهات ومتابعات`):**
   - Ranks unsent Hot (`≥85%`) & Warm (`≥60%`) matches + Day-2 post-send check-ins + Day-7 / Day-30 buyer re-engagement leads, with **1-tap `HYPERLINK("https://wa.me/...")` send buttons** containing pre-filled Arabic messages!
4. **Automated Triggers (`m3_installTriggers`):**
   - **Instant onEdit Trigger (`m3_onEditTrigger`):** Automatically runs matching the moment Noura changes a property's status to `تمت المراجعة` or `منشور`.
   - **6-Hourly Scheduled Job (`m3_dailyAutomationJob`):** Imports Google Alerts RSS feeds → runs duplicate check → runs full matching → refreshes `🔥 تنبيهات ومتابعات` → optionally sends Noura an Arabic HTML email digest with 1-tap WhatsApp buttons!

---

## Installation Steps (5 minutes)

1. Open your Phase 1 Google Sheet → **Extensions → Apps Script**.
2. **Update `Code.gs` (`01_setup_database.gs`):**
   - Replace `onOpen()` (or update the whole file) with the latest [`01_setup_database.gs`](../phase1/01_setup_database.gs) so the **`🏢 وقار للعقارات`** menu includes all Phase 3 actions.
3. **Add `MatchingEngine.gs`:**
   - Next to **Files**, click **`+` → Script** and name it `MatchingEngine`.
   - Paste the entire contents of [`01_matching_engine.gs`](01_matching_engine.gs) and click **Save (`Ctrl+S`)**.
4. **Run Self-Test:**
   - Select `m3_testMatchingEngine` from the editor dropdown → click **Run** → verify scores in Execution Log (`Exact Buyer` high, `Neighbor Buyer` medium-high, `Land Buyer` rejected at `0%`).
5. **Install Automated Triggers:**
   - Refresh the Google Sheet tab → open menu **`🏢 وقار للعقارات` → `⏰ تفعيل التشغيل التلقائي (المرحلة 3)`** (or run `m3_installTriggers` once from the editor) and accept permissions.

---

## Optional: Enable 1-Tap Gmail Digest for Noura

Because Noura uses the free WhatsApp Business App (no API), you can enable an optional automated email digest so every 6 hours (when new hot leads or due follow-ups exist), Gmail sends her a clean Arabic table with green **"إرسال واتساب"** buttons she can tap straight from her phone:

- In Apps Script **Project Settings → Script Properties**, add:
  - **Property:** `NOURA_ALERT_EMAIL`
  - **Value:** Noura's Gmail address
- Or add a row in `⚙️ الإعدادات` with Column A = `بريد التنبيهات` and Column B = Noura's email.

