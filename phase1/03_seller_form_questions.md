# 📝 Seller Intake Form — نموذج استقبال العقارات
**Google Form structure for Waqar Real Estate — waqar.runasp.net**

---

## FORM SETTINGS

- **Title**: وقار للاستثمار العقاري — أضف عقارك 🏠
- **Description**: 
  > مرحبًا! 👋 سجّل بيانات عقارك بدقة ونتواصل معك في أسرع وقت.  
  > لدينا قاعدة مشترين في جميع مناطق الإسكندرية ✅  
  > للاستفسار: واتساب 01108118381
- **Language**: Arabic (RTL)
- **Collect email**: OFF
- **Limit to 1 response**: OFF
- **Confirmation message**: شكرًا! تم استلام بيانات عقارك ✅ سنتواصل معك خلال 24 ساعة. للاستعجال: 01108118381

---

## SECTION 1: بيانات التواصل

**Q1 — الاسم (required)**
- Type: Short answer
- Placeholder: اسمك الكريم

**Q2 — رقم الواتساب (required)**
- Type: Short answer
- Placeholder: 010XXXXXXXX
- Validation: Text — matches pattern `^(\+20|0)(10|11|12|15)\d{8}$`

---

## SECTION 2: بيانات العقار الأساسية

**Q3 — نوع الوحدة (required)**
- Type: Multiple choice (single)
- Options:
  - 🏢 شقة
  - 🏗️ أرض
  - 🏪 محل تجاري
  - 🏡 فيلا
  - 🏠 دوبلكس
  - 🌆 بنتهاوس
  - 🏖️ شاليه
  - 🛋️ استوديو

**Q4 — المنطقة في اسكندرية (required)**
- Type: Dropdown
- Options:
  - سموحة
  - روشدي
  - سان ستيفانو
  - سبورتنج
  - ستانلي
  - ميامي
  - سيدي بشر
  - المندرة
  - كليوباترا
  - مونتازة
  - العجمي
  - أبو قير
  - المعمورة
  - برج العرب
  - الدخيلة
  - العامرية
  - وسط البلد / الإبراهيمية
  - بحري
  - منطقة أخرى (اذكرها في ملاحظات)

**Q5 — الشارع أو القريب من (required)**
- Type: Short answer
- Placeholder: مثال: شارع الحرية، قريب من مسجد...

**Q6 — المساحة بالمتر المربع (required)**
- Type: Short answer (number)
- Placeholder: مثال: 120
- Validation: Number — greater than 0

---

## SECTION 3: تفاصيل الوحدة

**Q7 — الدور (shown if Q3 ≠ أرض)**
- Type: Short answer
- Placeholder: مثال: 3

**Q8 — إجمالي عدد الأدوار في العقار (shown if Q3 = شقة/فيلا/دوبلكس/بنتهاوس)**
- Type: Short answer
- Placeholder: مثال: 10

**Q9 — عدد الغرف (shown if Q3 ≠ أرض/محل)**
- Type: Multiple choice
- Options: 1 | 2 | 3 | 4 | 5 أو أكثر | استوديو

**Q10 — عدد الحمامات (shown if Q3 ≠ أرض/محل)**
- Type: Multiple choice
- Options: 1 | 2 | 3 | أكثر

**Q11 — مستوى التشطيب**
- Type: Multiple choice
- Options:
  - ✨ تشطيب سوبر لوكس
  - 🏠 تشطيب لوكس
  - 🔨 نص تشطيب
  - 🧱 خام (بدون تشطيب)
  - 🛋️ مفروش

**Q12 — مزايا الوحدة**
- Type: Checkboxes (multi-select)
- Options:
  - 🛗 أسانسير
  - 🚗 باركينج / جراج
  - 🌊 فيو بحر
  - 🌳 حديقة خاصة
  - 🏊 حمام سباحة
  - 🏘️ كمبوند
  - 🌬️ تكييف مركزي
  - 🔐 أمن وحراسة
  - 📡 إنترنت فايبر
  - 🌅 بالكونة

**Q13 — عمر المبنى تقريبًا (optional)**
- Type: Multiple choice
- Options:
  - جديد (أقل من 5 سنوات)
  - 5-10 سنوات
  - 10-20 سنة
  - أكثر من 20 سنة
  - غير محدد

---

## SECTION 4: السعر وطريقة البيع

**Q14 — السعر الإجمالي بالجنيه المصري (required)**
- Type: Short answer (number)
- Placeholder: مثال: 2500000

**Q15 — طريقة الدفع المقبولة (required)**
- Type: Multiple choice
- Options:
  - 💵 كاش فقط
  - 📅 تقسيط فقط
  - 💵📅 كاش أو تقسيط

**Q16 — المقدم (للتقسيط فقط) — optional**
- Type: Short answer
- Placeholder: مثال: 500000 جنيه

**Q17 — هل السعر قابل للتفاوض؟**
- Type: Multiple choice
- Options: ✅ نعم | ❌ لا | 🤝 ربما

---

## SECTION 5: الوضع القانوني

**Q18 — حالة السند / الملكية (required)**
- Type: Multiple choice
- Options:
  - 📜 ملكية تامة (سند شهر عقاري)
  - 📋 عقد ابتدائي
  - 🏢 تمليك (شركة تطوير)
  - 🏛️ وحدة حكومية
  - ❓ غير محدد / اسأل الوسيط

---

## SECTION 6: الصور والوصف

**Q19 — رابط الصور (Google Drive أو أي رابط مشترك)**
- Type: Short answer
- Placeholder: ضعي رابط مجلد صور العقار هنا
- Description: *إذا ما عندك رابط، أرسل الصور مباشرة على واتساب 01108118381*

**Q20 — وصف إضافي أو ملاحظات (optional)**
- Type: Paragraph
- Placeholder: أي تفاصيل إضافية تريد إضافتها عن العقار...

---

## SECTION 7: (Optional) تفاصيل للتواصل

**Q21 — أفضل وقت للتواصل معك**
- Type: Multiple choice
- Options:
  - 🌅 صباحًا (9ص - 12م)
  - ☀️ ظهرًا (12م - 4م)
  - 🌆 مساءً (4م - 8م)
  - 🌙 أي وقت

---

## GOOGLE SHEETS INTEGRATION

After creating the form:
1. Click **Responses** tab → **Link to Sheets**
2. Create new spreadsheet named: `وقار - نموذج البائعين`
3. Copy/paste new submissions into the main Listings sheet (🏠 العقارات)
4. Set up email notification: Responses > 3-dot menu > **Get email notifications for new responses**

---

## SHARING THE FORM

Share link in:
- [ ] Facebook Page bio ("أضف عقارك هنا")
- [ ] Facebook Page pinned post
- [ ] WhatsApp Business auto-reply message
- [ ] Website page (embed via iframe)
- [ ] Instagram bio link

---

*Waqar Real Estate | waqar.runasp.net | +201108118381*

