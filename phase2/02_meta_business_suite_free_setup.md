# ⚡ Immediate Free Chatbot Setup — Meta Business Suite (No App Review Needed)
**Go live today in ~10 minutes with $0 cost and NO 25-contact limit.**

---

## Why Use Meta Business Suite First?

| Tool | Monthly Cost | Public Contact Limit | Google Sheets Sync | Meta App Review Needed? |
|---|---|---|---|---|
| **ManyChat Free** | $0 | ⚠️ **25 contacts/month max** | ❌ Pro only | No |
| **Meta Business Suite Inbox Automations** | $0 | ✅ **Unlimited** | Manual / Form links | **No (Live instantly)** |
| **Our Custom GAS Bot (`01_messenger_bot.gs`)** | $0 | ✅ **Unlimited** | ✅ **Direct read/write** | Yes (for public users) |

**Best Strategy:**
1. Turn on **Meta Business Suite Automations** right now so `facebook.com/Waqar.Realestatee` replies to 100% of public buyers & sellers immediately.
2. Simultaneously deploy [`01_messenger_bot.gs`](01_messenger_bot.gs) in Development Mode (works with your & Noura's Facebook accounts right away) and submit Meta App Review so the custom bot takes over with full Google Sheets automation!

---

## Step-by-Step Setup in Meta Business Suite (Arabic User Experience)

1. Open [business.facebook.com](https://business.facebook.com/) and select **Waqar Real Estate** (`facebook.com/Waqar.Realestatee`).
2. Go to **Inbox** (صندوق البريد) → click **Automations** (عمليات التشغيل التلقائي) in the top bar.

### Automation 1: Instant Reply (الرد الفوري)
- Channel: **Messenger**
- Schedule: Always on (or outside work hours)
- Copy-paste this Arabic message (replace the two form links from your `⚙️ الإعدادات` sheet `B7` and `B8`):

```
أهلاً بحضرتك في *وقار للاستثمار العقاري* بالإسكندرية 🏢🌟

شكراً لتواصلك معنا! لتقديم أسرع خدمة:
🔑 لو بتبحث عن شقة / أرض / محل:
سجّل مواصفات طلبك والميزانية في دقيقة واحدة وسنرشح لك أنسب الوحدات فوراً:
[PASTE BUYER FORM LINK FROM SETTINGS!B8]

🏠 لو عندك عقار للبيع في الإسكندرية:
سجّل بيانات وحدتك لعرضها على قاعدة مشترينا:
[PASTE SELLER FORM LINK FROM SETTINGS!B7]

📲 أو تواصل معنا واتساب مباشرة:
https://wa.me/201108118381
```

### Automation 2: Frequently Asked Questions (الأسئلة المتكررة — 4 Tap Buttons)
Turn on **Frequently Asked Questions** on **Messenger** and add these 4 Arabic quick-tap questions:

1. **Question**: `🔑 أبحث عن عقار للشراء في الإسكندرية`
   **Automated Response**:
   ```
   أهلاً بحضرتك 🌟 خدمتنا للمشترين مجانية 100% في مرحلة الترشيح.
   سجّل منطقتك وميزانيتك هنا وهنبعتلك أنسب العروض المتاحة فوراً:
   👉 [PASTE BUYER FORM LINK]
   أو ابعتلنا واتساب: https://wa.me/201108118381
   ```

2. **Question**: `🏠 لدي عقار (شقة / أرض / محل) للبيع`
   **Automated Response**:
   ```
   أهلاً بحضرتك 🌟 يسعدنا تسويق عقارك لقاعدة مشترينا الجادين في الإسكندرية.
   سجّل بيانات العقار هنا في دقيقة:
   👉 [PASTE SELLER FORM LINK]
   وبعدها ابعت الصور على واتساب: https://wa.me/201108118381
   ```

3. **Question**: `📍 ما المناطق التي تغطونها؟`
   **Automated Response**:
   ```
   نغطي جميع أحياء الإسكندرية: سموحة، روشدي، سان ستيفانو، سبورتنج، ستانلي، جليم، كفر عبده، سيدي جابر، ميامي، سيدي بشر، المندرة، العجمي، برج العرب وغيرها 🏢
   تصفح الموقع: http://waqar.runasp.net/
   ```

4. **Question**: `📲 ما رقم الواتساب للتواصل المباشر؟`
   **Automated Response**:
   ```
   تقدر تتواصل مع أ/ نورا إسماعيل مباشرة عبر واتساب أو اتصال:
   📞 01108118381
   💬 https://wa.me/201108118381
   ```

### Automation 3: Custom Keywords (كلمات مفتاحية)
Create a **Custom Keywords** rule for Messenger with keywords:
`السعر`, `بكام`, `التفاصيل`, `فين`, `مهتم`, `متاح`, `شقة`, `أرض`, `محل`

**Response**:
```
أهلاً بحضرتك 🌟 لمعرفة السعر والتفاصيل وترشيح وحدات مشابهة في نفس ميزانيتك:
🔑 سجّل طلبك في ثواني: [PASTE BUYER FORM LINK]
📲 أو تواصل واتساب مباشرة: https://wa.me/201108118381
```

---

## Note on ManyChat Free (If You Still Want to Try It)
You *can* connect ManyChat Free to `Waqar.Realestatee` for basic comment-to-DM tests, **but keep in mind**:
- ManyChat Free stops working after **25 Active Contacts per month**.
- ManyChat Free **cannot** sync leads to Google Sheets (requires ManyChat Pro).
- Therefore, **Meta Business Suite (for today) + `01_messenger_bot.gs` (for full Sheets automation)** is the superior $0 architecture.

