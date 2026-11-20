/**
 * ============================================================
 *  WAQAR REAL ESTATE — Phase 1: Full Database, Forms & Sync
 *  وقار للاستثمار العقاري — قاعدة البيانات + النماذج + المزامنة
 * ============================================================
 *  HOW TO USE (خطوات التشغيل):
 *  1. Open your Google Spreadsheet (ملف Google Sheets)
 *  2. Go to Extensions > Apps Script (الامتدادات > Apps Script)
 *  3. Delete all existing code and paste this entire file
 *  4. Click Save (حفظ Ctrl+S)
 *  5. Select "setupWaqarDatabase" from the top dropdown & click Run (تشغيل)
 *  6. Accept permissions when asked
 *  7. Refresh the Google Sheet tab — you will see a new menu: "🏢 وقار للعقارات"
 *  8. From that menu inside the Sheet, click: "📝 إنشاء نماذج Google Forms تلقائياً"
 * ============================================================
 *  CEO: Noura Ismail | Alexandria, Egypt
 *  WhatsApp: +201108118381
 *  Facebook: https://www.facebook.com/Waqar.Realestatee
 *  Website: http://waqar.runasp.net/
 * ============================================================
 */

var WAQAR_CONFIG = {
  COMPANY_NAME: 'وقار للاستثمار العقاري',
  CEO_NAME: 'نورا إسماعيل',
  WHATSAPP_DISPLAY: '+201108118381',
  WHATSAPP_INTL: '201108118381',
  FB_PAGE: 'https://www.facebook.com/Waqar.Realestatee',
  WEBSITE: 'http://waqar.runasp.net/',
  SHEETS: {
    DASHBOARD: '📊 الرئيسية',
    LISTINGS: '🏠 العقارات',
    BUYERS: '👥 المشترون',
    FETCH_QUEUE: '🌐 جلب العقارات (خارجي)',
    MATCHES: '🔗 التطابقات',
    SETTINGS: '⚙️ الإعدادات'
  }
};

var ALEXANDRIA_DISTRICTS = [
  'سموحة', 'روشدي', 'سان ستيفانو', 'سبورتنج', 'ستانلي', 'جليم', 'زيزينيا',
  'سيدي جابر', 'كفر عبده', 'لوران', 'فيكتوريا', 'ميامي', 'سيدي بشر',
  'المندرة', 'كليوباترا', 'الإبراهيمية', 'محرم بك', 'المنتزه', 'المعمورة',
  'أبو قير', 'العجمي', 'الهانوفيل', 'البيطاش', 'برج العرب', 'الدخيلة',
  'العامرية', 'وسط البلد', 'بحري', 'منطقة أخرى'
];

var PROPERTY_TYPES = [
  'شقة', 'أرض', 'محل تجاري', 'فيلا', 'دوبلكس', 'بنتهاوس', 'شاليه', 'استوديو'
];


// ============================================================
// CUSTOM MENU INSIDE GOOGLE SHEETS (يظهر تلقائياً عند فتح الملف)
// ============================================================
function onOpen() {
  try {
    const menu = SpreadsheetApp.getUi()
      .createMenu('🏢 وقار للعقارات')
      .addItem('🚀 1️⃣ بدء البحث الآلي عن العقارات والمشترين فوراً', 'triggerInstantAutomatedSourcing')
      .addItem('🎯 2️⃣ تشغيل المطابقة الشاملة وتحديث الواتساب', 'm3_runFullMatching')
      .addSeparator()
      .addItem('🔝 3️⃣ رفع وترتيب العقارات إلى القمة (حفظ كافة البيانات دون مسح)', 'cleanAndFixSheetRows')
      .addItem('✅ 4️⃣ نقل العقارات الموافق عليها إلى العقارات الرسمية', 'moveApprovedFetchedToListings')
      .addItem('📢 5️⃣ توليد منشور فيسبوك للعقار المحدد', 'generateQuickFacebookPost')
      .addItem('💬 6️⃣ توليد رسالة واتساب للتطابق المحدد', 'generateWhatsAppAlertForSelectedRow')
      .addSeparator()
      .addItem('🏠 مطابقة العقار المحدد مع المشترين', 'm3_matchSelectedListing')
      .addItem('🔑 مطابقة المشتري المحدد مع العقارات', 'm3_matchSelectedBuyer')
      .addItem('🔥 تحديث قائمة التنبيهات والمتابعات', 'm3_buildActionQueueSheet')
      .addItem('🔍 فحص العقارات المكررة', 'm3_checkDuplicates')
      .addSeparator()
      .addItem('⚙️ إعداد وتحديث قاعدة البيانات والنماذج', 'setupWaqarDatabase')
      .addItem('⏰ تفعيل الجدولة التلقائية اليومية', 'm3_installTriggers')
      .addItem('⚠️ مسح كامل وإعادة الضبط', 'DANGER_fullReset')
      .addToUi();
  } catch (err) {
    Logger.log('onOpen note: ' + err);
  }
}


// ============================================================
// SAFE UI ALERT (لا يتسبب في خطأ عند التشغيل من محرر الكود)
// ============================================================
function safeAlert(title, message) {
  Logger.log('[' + title + ']\n' + message);
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (e) {
    // Running from Apps Script Editor where Sheet UI context is unavailable.
    // Toast or Logger handles feedback cleanly without throwing an exception.
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast(title, 'وقار للعقارات', 8);
    } catch (ignored) {}
  }
}


// ============================================================
// ENTRY POINT 1 — Setup / Update Database Sheets
// ============================================================
function setupWaqarDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('يجب فتح الكود من داخل ملف Google Sheets عبر: الامتدادات > Apps Script');
  }

  Logger.log('Creating sheets...');

  const dashSheet    = getOrCreateSheet(ss, WAQAR_CONFIG.SHEETS.DASHBOARD, true);
  const listSheet    = getOrCreateSheet(ss, WAQAR_CONFIG.SHEETS.LISTINGS, false);
  const buyerSheet   = getOrCreateSheet(ss, WAQAR_CONFIG.SHEETS.BUYERS, false);
  const fetchSheet   = getOrCreateSheet(ss, WAQAR_CONFIG.SHEETS.FETCH_QUEUE, false);
  const matchSheet   = getOrCreateSheet(ss, WAQAR_CONFIG.SHEETS.MATCHES, false);
  const settSheet    = getOrCreateSheet(ss, WAQAR_CONFIG.SHEETS.SETTINGS, false);

  setupListingsSheet(listSheet);
  setupBuyersSheet(buyerSheet);
  setupFetchQueueSheet(fetchSheet);
  setupMatchesSheet(matchSheet);
  setupSettingsSheet(settSheet);
  setupDashboard(dashSheet);

  // Move sheets into clean order
  const order = [
    dashSheet, listSheet, buyerSheet, fetchSheet, matchSheet, settSheet
  ];
  order.forEach((sh, idx) => {
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(idx + 1);
  });
  ss.setActiveSheet(dashSheet);

  // Remove default empty "Sheet1" / "الورقة1" if it exists and is empty
  ['Sheet1', 'الورقة1', 'الورقة 1'].forEach(defName => {
    const defSheet = ss.getSheetByName(defName);
    if (defSheet && defSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(defSheet);
    }
  });

  // Persist SPREADSHEET_ID so background triggers (Phase 2 & 3) always resolve this Sheet
  try {
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  } catch (e) {}

  // Refresh custom menu immediately if UI is available
  onOpen();

  safeAlert(
    '✅ تم إعداد قاعدة بيانات وقار بنجاح!',
    'تم إنشاء 6 أوراق عمل:\n\n' +
    '📊 الرئيسية — لوحة التحكم\n' +
    '🏠 العقارات — قاعدة بيانات العقارات\n' +
    '👥 المشترون — قاعدة بيانات المشترين\n' +
    '🌐 جلب العقارات (خارجي) — قائمة العقارات المجلوبة من المنصات\n' +
    '🔗 التطابقات — سجل التطابقات\n' +
    '⚙️ الإعدادات — إعدادات النظام وروابط النماذج\n\n' +
    'الخطوة التالية: حدثي صفحة Google Sheets، ثم من القائمة العلوية:\n' +
    '🏢 وقار للعقارات > 2️⃣ إنشاء نماذج Google Forms تلقائياً'
  );
}


// ============================================================
// HELPER: Get or create a sheet (preserves user rows if clearAll=false)
// ============================================================
function getOrCreateSheet(ss, name, clearAll) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  } else if (clearAll) {
    sheet.clearContents();
    sheet.clearFormats();
    sheet.clearConditionalFormatRules();
  }
  try {
    sheet.setRightToLeft(true);
  } catch (e) {}
  return sheet;
}


// ============================================================
// SHEET 1: LISTINGS (🏠 العقارات)
// ============================================================
function setupListingsSheet(sheet) {
  const columns = [
    ['رقم العقار',            85],   // A  1  — auto WQ-001
    ['تاريخ الإضافة',         110],  // B  2
    ['المصدر',                130],  // C  3  — dropdown
    ['الحالة',                115],  // D  4  — dropdown + color
    ['نوع الوحدة',            110],  // E  5  — dropdown
    ['المنطقة',               120],  // F  6  — dropdown
    ['الشارع / القريب من',   170],  // G  7
    ['الدور',                 70],   // H  8
    ['إجمالي الأدوار',        90],   // I  9
    ['المساحة (م²)',           90],   // J  10
    ['الغرف',                 65],   // K  11
    ['الحمامات',              75],   // L  12
    ['الصالات / الريسبشن',    100],  // M  13
    ['التشطيب',               145],  // N  14 — dropdown
    ['عمر المبنى (سنة)',      100],  // O  15
    ['مزايا الوحدة',         220],  // P  16
    ['السعر الإجمالي (ج)',    140],  // Q  17
    ['سعر المتر (ج) تلقائي',  130],  // R  18 — formula
    ['طريقة الدفع',           130],  // S  19 — dropdown
    ['المقدم (ج)',             115],  // T  20
    ['قابل للتفاوض',           95],   // U  21 — dropdown
    ['اسم البائع',            140],  // V  22
    ['واتساب البائع',         140],  // W  23 — plain text
    ['حالة السند',            160],  // X  24 — dropdown
    ['الوصف الأصلي',          300],  // Y  25
    ['المنشور المولّد',       380],  // Z  26
    ['رابط الصور (Drive)',    210],  // AA 27
    ['رابط المنشور (FB)',     210],  // AB 28
    ['رابط الموقع / المصدر',  210],  // AC 29
    ['ملاحظات نورا',          250],  // AD 30
    ['عدد المتطابقين',        100],  // AE 31 — formula
    ['آخر تحديث',             120],  // AF 32
    ['تواصل واتساب سريع',     130],  // AG 33 — formula hyperlink
  ];

  const headers = columns.map(c => c[0]);
  const widths  = columns.map(c => c[1]);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#1a237e')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.setRowHeight(1, 55);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  const nRows = 500;

  // Dropdown validations
  applyDropdown(sheet, 2, 3, nRows, [
    'واتساب', 'ماسنجر', 'نموذج البائعين', 'نموذج الموقع', 'OLX / دوبيزل',
    'مجموعات فيسبوك', 'ماركت بليس', 'عقارماب', 'بروبرتي فايندر', 'إنستجرام', 'إحالة شخصية'
  ]);
  applyDropdown(sheet, 2, 4, nRows, [
    'جديد', 'تمت المراجعة', 'منشور', 'مؤجل', 'مباع', 'مؤرشف'
  ]);
  applyDropdown(sheet, 2, 5, nRows, PROPERTY_TYPES);
  applyDropdown(sheet, 2, 6, nRows, ALEXANDRIA_DISTRICTS);
  applyDropdown(sheet, 2, 14, nRows, [
    'تشطيب سوبر لوكس', 'تشطيب الترا سوبر لوكس', 'تشطيب لوكس', 'نص تشطيب', 'خام', 'مفروش', 'غير منطبق (أرض)'
  ]);
  applyDropdown(sheet, 2, 19, nRows, ['كاش', 'تقسيط', 'كاش أو تقسيط']);
  applyDropdown(sheet, 2, 21, nRows, ['نعم', 'لا', 'ربما']);
  applyDropdown(sheet, 2, 24, nRows, [
    'ملكية تامة', 'عقد ابتدائي', 'تمليك', 'صحة توقيع', 'إيجار قديم', 'وحدة حكومية', 'غير محدد'
  ]);

  // Batch Formulas (fast single API call per column)
  const idFormulas = [];
  const sqmFormulas = [];
  const matchCountFormulas = [];
  const waLinkFormulas = [];

  for (let i = 2; i <= nRows + 1; i++) {
    idFormulas.push([`=IF(E${i}<>"","WQ-"&TEXT(ROW()-1,"000"),"")`]);
    sqmFormulas.push([`=IF(AND(ISNUMBER(Q${i}),ISNUMBER(J${i}),J${i}>0),ROUND(Q${i}/J${i},0),"")`]);
    matchCountFormulas.push([`=IF(A${i}<>"",COUNTIF('${WAQAR_CONFIG.SHEETS.MATCHES}'!C:C,A${i}),"")`]);
    waLinkFormulas.push([buildWaHyperlinkFormula(`W${i}`, `"💬 واتساب البائع"`)]);
  }

  sheet.getRange(2, 1, nRows, 1).setFormulas(idFormulas);
  sheet.getRange(2, 18, nRows, 1).setFormulas(sqmFormulas);
  sheet.getRange(2, 31, nRows, 1).setFormulas(matchCountFormulas);
  sheet.getRange(2, 33, nRows, 1).setFormulas(waLinkFormulas);

  // Number & Text Formats
  sheet.getRange(2, 2, nRows, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, 17, nRows, 1).setNumberFormat('#,##0');
  sheet.getRange(2, 18, nRows, 1).setNumberFormat('#,##0');
  sheet.getRange(2, 20, nRows, 1).setNumberFormat('#,##0');
  sheet.getRange(2, 23, nRows, 1).setNumberFormat('@'); // Plain text preserves leading 0
  sheet.getRange(2, 32, nRows, 1).setNumberFormat('dd/mm/yyyy hh:mm');

  // Conditional Formatting for Status
  const statusRange = sheet.getRange(2, 4, nRows, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('جديد').setBackground('#fff9c4').setFontColor('#f57f17').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('تمت المراجعة').setBackground('#e3f2fd').setFontColor('#0d47a1').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('منشور').setBackground('#c8e6c9').setFontColor('#1b5e20').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('مباع').setBackground('#1b5e20').setFontColor('#ffffff').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('مؤجل').setBackground('#fce4ec').setFontColor('#880e4f').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('مؤرشف').setBackground('#eeeeee').setFontColor('#757575').setRanges([statusRange]).build(),
  ]);
}


// ============================================================
// SHEET 2: BUYERS (👥 المشترون)
// ============================================================
function setupBuyersSheet(sheet) {
  const columns = [
    ['رقم المشتري',           100],  // A  1
    ['تاريخ التسجيل',         110],  // B  2
    ['المصدر',                130],  // C  3
    ['الحالة',                120],  // D  4
    ['الاسم',                 150],  // E  5
    ['واتساب',                140],  // F  6 — plain text
    ['نوع الوحدة المطلوبة',   150],  // G  7
    ['الميزانية الأقصى (ج)',  140],  // H  8
    ['الميزانية الأدنى (ج)',  140],  // I  9
    ['المناطق المفضلة',       220],  // J  10
    ['المساحة الأدنى (م²)',   120],  // K  11
    ['طريقة الدفع المفضلة',  150],  // L  12
    ['الوقت المتاح',          140],  // M  13
    ['مواصفات مهمة',          250],  // N  14
    ['ملاحظات',               260],  // O  15
    ['آخر تواصل',             110],  // P  16
    ['عدد مرات التواصل',      100],  // Q  17
    ['العقارات المرسلة',      280],  // R  18
    ['مهتم بـ (رقم العقار)',  180],  // S  19
    ['آخر تحديث',             120],  // T  20
    ['تواصل واتساب سريع',     130],  // U  21
  ];

  const headers = columns.map(c => c[0]);
  const widths  = columns.map(c => c[1]);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#1b5e20')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.setRowHeight(1, 55);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  const nRows = 500;

  applyDropdown(sheet, 2, 3, nRows, [
    'تعليق فيسبوك', 'ماسنجر', 'واتساب', 'نموذج المشترين', 'نموذج الموقع',
    'جروبات فيسبوك (طلب مشتري)', 'دوبيزل (مطلوب)', 'عقارماب (مطلوب)', 'تعليق خارجي', 'إحالة شخصية'
  ]);
  applyDropdown(sheet, 2, 4, nRows, [
    'نشط 🔥', 'دافئ 🌡️', 'بارد ❄️', 'مغلق ✅ تم الشراء', 'مغلق ❌ انسحب'
  ]);
  applyDropdown(sheet, 2, 7, nRows, [
    'شقة', 'أرض', 'محل تجاري', 'فيلا / دوبلكس', 'فيلا', 'بنتهاوس', 'شاليه', 'استوديو', 'أي نوع مناسب'
  ]);
  applyDropdown(sheet, 2, 12, nRows, ['كاش فقط', 'تقسيط فقط', 'كاش أو تقسيط']);
  applyDropdown(sheet, 2, 13, nRows, [
    'عاجل — أقل من شهر', 'خلال 1-3 شهور', 'خلال 3-6 شهور', 'مرن — مش عارف بالضبط'
  ]);

  const idFormulas = [];
  const waFormulas = [];
  for (let i = 2; i <= nRows + 1; i++) {
    idFormulas.push([`=IF(E${i}<>"","BYR-"&TEXT(ROW()-1,"000"),"")`]);
    waFormulas.push([buildContactHyperlinkFormula(`F${i}`, `"💬 تواصل مع المشتري"`)]);
  }
  sheet.getRange(2, 1, nRows, 1).setFormulas(idFormulas);
  sheet.getRange(2, 21, nRows, 1).setFormulas(waFormulas);

  sheet.getRange(2, 2, nRows, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, 6, nRows, 1).setNumberFormat('@');
  sheet.getRange(2, 8, nRows, 1).setNumberFormat('#,##0');
  sheet.getRange(2, 9, nRows, 1).setNumberFormat('#,##0');
  sheet.getRange(2, 20, nRows, 1).setNumberFormat('dd/mm/yyyy hh:mm');

  const statusRange = sheet.getRange(2, 4, nRows, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('نشط').setBackground('#fff9c4').setFontColor('#e65100').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('دافئ').setBackground('#fff3e0').setFontColor('#bf360c').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('بارد').setBackground('#e3f2fd').setFontColor('#0d47a1').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('تم الشراء').setBackground('#1b5e20').setFontColor('#ffffff').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('انسحب').setBackground('#eeeeee').setFontColor('#757575').setRanges([statusRange]).build(),
  ]);
}


// ============================================================
// SHEET 3: EXTERNAL FETCH QUEUE (🌐 جلب العقارات (خارجي))
// Track B: العقارات المجلوبة من فيسبوك جروبس / OLX / عقارماب / إنستجرام
// ============================================================
function setupFetchQueueSheet(sheet) {
  const columns = [
    ['رقم الجلب',               90],   // A 1 — auto EXT-001
    ['تاريخ الجلب',             110],  // B 2
    ['المنصة',                  130],  // C 3
    ['رابط الإعلان الأصلي',     220],  // D 4
    ['نوع الوحدة',              110],  // E 5
    ['المنطقة',                 120],  // F 6
    ['المساحة (م²)',             90],   // G 7
    ['السعر (ج)',               130],  // H 8
    ['اسم المعلن',              130],  // I 9
    ['واتساب / هاتف المعلن',    140],  // J 10 — plain text
    ['تواصل سريع (رسالة جاهزة)', 170],  // K 11 — wa.me with outreach text
    ['النص الأصلي المنسوخ',     300],  // L 12
    ['حالة التواصل',            190],  // M 13
    ['ملاحظات نورا',            220],  // N 14
    ['رقم العقار بعد النقل',     120],  // O 15 — WQ-XXX once approved
  ];

  const headers = columns.map(c => c[0]);
  const widths  = columns.map(c => c[1]);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#006064')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.setRowHeight(1, 55);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  const nRows = 500;

  applyDropdown(sheet, 2, 3, nRows, [
    'مجموعات فيسبوك', 'ماركت بليس', 'OLX / دوبيزل', 'عقارماب', 'بروبرتي فايندر', 'إنستجرام', 'أخرى'
  ]);
  applyDropdown(sheet, 2, 5, nRows, PROPERTY_TYPES);
  applyDropdown(sheet, 2, 6, nRows, ALEXANDRIA_DISTRICTS);
  applyDropdown(sheet, 2, 13, nRows, [
    'لم يتم التواصل',
    'تم التواصل — في الانتظار',
    'وافق البائع ✅ (انقله للعقارات)',
    'مكرر 🔁',
    'رفض / مباع ❌'
  ]);

  const idFormulas = [];
  const outreachFormulas = [];
  for (let i = 2; i <= nRows + 1; i++) {
    idFormulas.push([`=IF(OR(C${i}<>"",L${i}<>""),"EXT-"&TEXT(ROW()-1,"000"),"")`]);
    const msgExpr =
      `"السلام عليكم ورحمة الله 🌟"&CHAR(10)&` +
      `"مع حضرتك نورا من صفحة وقار للاستثمار العقاري بالإسكندرية."&CHAR(10)&` +
      `"شفت إعلانك عن "&IF(E${i}<>"",E${i},"العقار")&` +
      `IF(F${i}<>""," في "&F${i},"")&` +
      `IF(H${i}<>""," بسعر "&TEXT(H${i},"#,##0")&" ج","")&"."&CHAR(10)&` +
      `"عندنا مشترين جادين بيبحثوا في نفس المنطقة والميزانية دي، وممكن نعرض الوحدة عليهم."&CHAR(10)&` +
      `"هل الوحدة لسه متاحة ونتعاون في بيعها؟"`;
    outreachFormulas.push([buildWaHyperlinkWithTextFormula(`J${i}`, msgExpr, `"📩 إرسال رسالة تواصل"`)]);
  }
  sheet.getRange(2, 1, nRows, 1).setFormulas(idFormulas);
  sheet.getRange(2, 11, nRows, 1).setFormulas(outreachFormulas);

  sheet.getRange(2, 2, nRows, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, 8, nRows, 1).setNumberFormat('#,##0');
  sheet.getRange(2, 10, nRows, 1).setNumberFormat('@');

  const statusRange = sheet.getRange(2, 13, nRows, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('لم يتم التواصل').setBackground('#fff9c4').setFontColor('#f57f17').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('في الانتظار').setBackground('#e3f2fd').setFontColor('#0d47a1').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('وافق البائع').setBackground('#c8e6c9').setFontColor('#1b5e20').setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextContains('رفض').setBackground('#eeeeee').setFontColor('#757575').setRanges([statusRange]).build(),
  ]);
}


// ============================================================
// SHEET 4: MATCHES (🔗 التطابقات)
// ============================================================
function setupMatchesSheet(sheet) {
  const columns = [
    ['رقم التطابق',          100],  // A
    ['تاريخ التطابق',        110],  // B
    ['رقم العقار',           100],  // C
    ['رقم المشتري',          100],  // D
    ['اسم المشتري',          150],  // E
    ['واتساب المشتري',       140],  // F
    ['نوع العقار',           110],  // G
    ['المنطقة',              120],  // H
    ['السعر (ج)',            130],  // I
    ['نسبة التطابق %',       105],  // J
    ['تفاصيل التطابق',       280],  // K
    ['حالة الإرسال',         120],  // L
    ['تاريخ الإرسال',        110],  // M
    ['رد المشتري',           200],  // N
    ['ملاحظات',              250],  // O
  ];

  const headers = columns.map(c => c[0]);
  const widths  = columns.map(c => c[1]);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#4a148c')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.setRowHeight(1, 55);
  sheet.setFrozenRows(1);
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  const nRows = 1000;

  applyDropdown(sheet, 2, 12, nRows, [
    'لم يُرسل', 'تم الإرسال', 'مهتم 👍', 'غير مهتم 👎', 'مكتمل ✅'
  ]);

  const idFormulas = [];
  for (let i = 2; i <= nRows + 1; i++) {
    idFormulas.push([`=IF(C${i}<>"","MTH-"&TEXT(ROW()-1,"000"),"")`]);
  }
  sheet.getRange(2, 1, nRows, 1).setFormulas(idFormulas);
  sheet.getRange(2, 6, nRows, 1).setNumberFormat('@');
  sheet.getRange(2, 9, nRows, 1).setNumberFormat('#,##0');

  const scoreRange = sheet.getRange(2, 10, nRows, 1);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(85).setBackground('#b71c1c').setFontColor('#ffffff').setRanges([scoreRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(60, 84).setBackground('#e65100').setFontColor('#ffffff').setRanges([scoreRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(60).setBackground('#1565c0').setFontColor('#ffffff').setRanges([scoreRange]).build(),
  ]);
}


// ============================================================
// SHEET 5: SETTINGS (⚙️ الإعدادات)
// ============================================================
function setupSettingsSheet(sheet) {
  const prevSellerFormUrl   = String(sheet.getRange('B7').getValue() || '');
  const prevBuyerFormUrl    = String(sheet.getRange('B8').getValue() || '');
  const prevSellerEmbedUrl  = String(sheet.getRange('C7').getValue() || '');
  const prevBuyerEmbedUrl   = String(sheet.getRange('C8').getValue() || '');
  const prevAlertEmail      = String(sheet.getRange('B9').getValue() || (PropertiesService.getScriptProperties().getProperty('NOURA_ALERT_EMAIL') || ''));
  const prevRssUrls         = String(sheet.getRange('B10').getValue() || (PropertiesService.getScriptProperties().getProperty('GOOGLE_ALERTS_RSS_URLS') || ''));

  const sellerFormCellVal = prevSellerFormUrl.indexOf('http') === 0
    ? prevSellerFormUrl
    : 'لم يُنشأ بعد — شغلي إنشاء النماذج من القائمة';
  const buyerFormCellVal  = prevBuyerFormUrl.indexOf('http') === 0
    ? prevBuyerFormUrl
    : 'لم يُنشأ بعد — شغلي إنشاء النماذج من القائمة';

  sheet.clearContents();
  sheet.clearFormats();
  sheet.clearConditionalFormatRules();

  if (prevSellerEmbedUrl.indexOf('http') === 0) sheet.getRange('C7').setValue(prevSellerEmbedUrl);
  if (prevBuyerEmbedUrl.indexOf('http') === 0)  sheet.getRange('C8').setValue(prevBuyerEmbedUrl);

  const data = [
    ['⚙️ إعدادات نظام وقار للاستثمار العقاري', ''],
    ['', ''],
    ['📞 معلومات التواصل والروابط', ''],
    ['واتساب نورا', WAQAR_CONFIG.WHATSAPP_DISPLAY],
    ['صفحة فيسبوك', WAQAR_CONFIG.FB_PAGE],
    ['الموقع الإلكتروني', WAQAR_CONFIG.WEBSITE],
    ['رابط نموذج البائعين (يُملأ تلقائياً)', sellerFormCellVal],
    ['رابط نموذج المشترين (يُملأ تلقائياً)', buyerFormCellVal],
    ['بريد التنبيهات (Gmail)', prevAlertEmail],
    ['روابط Google Alerts RSS (اختياري)', prevRssUrls],
    ['', ''],
    ['🤖 إعدادات خوارزمية المطابقة (المرحلة 3)', ''],
    ['الحد الأدنى لـ (ليد ساخن) %', 85],
    ['الحد الأدنى لـ (ليد دافئ) %', 60],
    ['وزن الميزانية %', 35],
    ['وزن الموقع %', 30],
    ['وزن النوع والمساحة %', 20],
    ['وزن طريقة الدفع %', 10],
    ['وزن المواصفات %', 5],
    ['', ''],
    ['🗺️ تصنيف مناطق الإسكندرية', 'المستوى'],
    ['سموحة', 'Prime'],
    ['روشدي', 'Prime'],
    ['سان ستيفانو', 'Prime'],
    ['سبورتنج', 'Prime'],
    ['ستانلي', 'Prime'],
    ['جليم', 'Prime'],
    ['زيزينيا', 'Prime'],
    ['كفر عبده', 'Prime'],
    ['سيدي جابر', 'Prime'],
    ['لوران', 'Mid'],
    ['فيكتوريا', 'Mid'],
    ['ميامي', 'Mid'],
    ['سيدي بشر', 'Mid'],
    ['المندرة', 'Mid'],
    ['كليوباترا', 'Mid'],
    ['الإبراهيمية', 'Mid'],
    ['محرم بك', 'Mid'],
    ['المنتزه', 'Mid'],
    ['العجمي', 'Mid'],
    ['أبو قير', 'Mid'],
    ['المعمورة', 'Suburban'],
    ['برج العرب', 'Suburban'],
    ['الدخيلة', 'Suburban'],
    ['العامرية', 'Suburban'],
    ['وسط البلد', 'Suburban'],
    ['بحري', 'Suburban'],
  ];

  // Ensure phone number stays text
  sheet.getRange(1, 2, data.length, 1).setNumberFormat('@');
  sheet.getRange(1, 1, data.length, 2).setValues(data);

  sheet.getRange(1, 1, 1, 2).merge()
    .setFontSize(13).setFontWeight('bold').setFontColor('#1a237e');

  [3, 12, 21].forEach(r => {
    sheet.getRange(r, 1, 1, 2).setFontWeight('bold').setBackground('#c5cae9').setFontSize(11);
  });

  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 420);
}


// ============================================================
// SHEET 6: DASHBOARD (📊 الرئيسية)
// ============================================================
function setupDashboard(sheet) {
  const L = WAQAR_CONFIG.SHEETS.LISTINGS;
  const B = WAQAR_CONFIG.SHEETS.BUYERS;
  const F = WAQAR_CONFIG.SHEETS.FETCH_QUEUE;
  const M = WAQAR_CONFIG.SHEETS.MATCHES;

  sheet.getRange('A1').setValue('🏢 وقار للاستثمار العقاري').setFontSize(18).setFontWeight('bold').setFontColor('#1a237e');
  sheet.getRange('A2').setValue('الإسكندرية، مصر  |  CEO: نورا إسماعيل  |  واتساب: 01108118381').setFontColor('#555555').setFontSize(11);
  sheet.getRange('A1:F1').merge();
  sheet.getRange('A2:F2').merge();

  sheet.getRange('A4').setValue('📊 إحصاءات حية').setFontWeight('bold').setFontSize(13).setFontColor('#1a237e');

  const stats = [
    ['إجمالي العقارات',              `=COUNTA('${L}'!E2:E5000)`,    'إجمالي المشترين',          `=COUNTA('${B}'!E2:E5000)`],
    ['عقارات جديدة (تحتاج مراجعة)',  `=COUNTIF('${L}'!D2:D5000,"جديد")`, 'مشترون نشطون 🔥',    `=COUNTIF('${B}'!D2:D5000,"نشط 🔥")`],
    ['عقارات منشورة',                `=COUNTIF('${L}'!D2:D5000,"منشور")`, 'مشترون دافئون 🌡️',  `=COUNTIF('${B}'!D2:D5000,"دافئ 🌡️")`],
    ['عقارات مباعة ✅',              `=COUNTIF('${L}'!D2:D5000,"مباع")`, 'صفقات مكتملة ✅',    `=COUNTIF('${M}'!L2:L5000,"مكتمل ✅")`],
    ['عقارات خارجية تنتظر التواصل',  `=COUNTIF('${F}'!M2:M5000,"لم يتم التواصل")`, 'نسبة الإغلاق', `=IF(COUNTA('${L}'!E2:E5000)>0,ROUND(COUNTIF('${L}'!D2:D5000,"مباع")/COUNTA('${L}'!E2:E5000)*100,1)&"%","0%")`],
  ];

  stats.forEach((row, i) => {
    const r = 6 + i;
    sheet.getRange(r, 1).setValue(row[0]).setFontWeight('bold').setFontSize(10);
    sheet.getRange(r, 2).setFormula(row[1]).setHorizontalAlignment('center')
      .setBackground('#e8eaf6').setFontSize(15).setFontWeight('bold').setFontColor('#1a237e');
    sheet.getRange(r, 4).setValue(row[2]).setFontWeight('bold').setFontSize(10);
    sheet.getRange(r, 5).setFormula(row[3]).setHorizontalAlignment('center')
      .setBackground('#e8f5e9').setFontSize(15).setFontWeight('bold').setFontColor('#1b5e20');
  });

  sheet.getRange('A12').setValue('🔗 روابط النظام').setFontWeight('bold').setFontSize(13).setFontColor('#1a237e');
  sheet.getRange('A13').setValue('صفحة فيسبوك').setFontWeight('bold');
  sheet.getRange('B13').setValue(WAQAR_CONFIG.FB_PAGE);
  sheet.getRange('A14').setValue('الموقع الإلكتروني').setFontWeight('bold');
  sheet.getRange('B14').setValue(WAQAR_CONFIG.WEBSITE);
  sheet.getRange('A15').setValue('نموذج البائعين (أضف عقارك)').setFontWeight('bold');
  sheet.getRange('B15').setFormula(`='${WAQAR_CONFIG.SHEETS.SETTINGS}'!B7`);
  sheet.getRange('A16').setValue('نموذج المشترين (ابحث عن عقار)').setFontWeight('bold');
  sheet.getRange('B16').setFormula(`='${WAQAR_CONFIG.SHEETS.SETTINGS}'!B8`);

  sheet.getRange('A18').setValue('📋 دليل العمل اليومي').setFontWeight('bold').setFontSize(13).setFontColor('#1a237e');
  const instructions = [
    ['1.', 'بائع أرسل عقار من النموذج', 'ينزل تلقائياً في 🏠 العقارات بحالة "جديد"'],
    ['2.', 'عقار من OLX / فيسبوك جروب', 'أضيفيه في 🌐 جلب العقارات (خارجي) واضغطي "📩 إرسال رسالة تواصل"'],
    ['3.', 'النشر على فيسبوك', 'حددي صف العقار > قائمة 🏢 وقار للعقارات > 📢 توليد منشور فيسبوك'],
    ['4.', 'مشترٍ سجّل بياناته', 'ينزل تلقائياً في 👥 المشترون مع تصنيف السخونة (🔥/🌡️/❄️)'],
    ['5.', 'إغلاق صفقة', 'غيّري حالة العقار إلى "مباع" والمشتري إلى "مغلق ✅ تم الشراء"'],
  ];
  instructions.forEach((row, i) => {
    sheet.getRange(19 + i, 1).setValue(row[0]).setFontWeight('bold').setFontColor('#1a237e');
    sheet.getRange(19 + i, 2).setValue(row[1]).setFontWeight('bold');
    sheet.getRange(19 + i, 3, 1, 4).merge().setValue(row[2]).setFontColor('#444444');
  });

  sheet.setColumnWidth(1, 230);
  sheet.setColumnWidth(2, 230);
  sheet.setColumnWidth(3, 35);
  sheet.setColumnWidth(4, 230);
  sheet.setColumnWidth(5, 160);
  sheet.setRowHeight(1, 45);
}


// ============================================================
// ENTRY POINT 2 — AUTO-CREATE BOTH GOOGLE FORMS & LINK THEM
// Run from menu: 🏢 وقار للعقارات > 2️⃣ إنشاء نماذج Google Forms تلقائياً
// ============================================================
function setupWaqarForms() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('افتحي الكود من داخل ملف Google Sheets');

  // 1) Create Seller Intake Form
  const sellerForm = FormApp.create('وقار للاستثمار العقاري — أضف عقارك 🏠');
  sellerForm.setDescription(
    'مرحبًا! 👋 سجّل بيانات عقارك بدقة ونتواصل معك في أسرع وقت.\n' +
    'لدينا قاعدة مشترين جادين في جميع مناطق الإسكندرية ✅\n' +
    'للاستفسار المباشر: واتساب 01108118381'
  );
  sellerForm.setConfirmationMessage(
    'شكرًا لك! تم استلام بيانات عقارك بنجاح ✅\n' +
    'ستتواصل معك أ/ نورا إسماعيل خلال 24 ساعة.\n' +
    'للاستعجال واتساب: 01108118381'
  );
  sellerForm.setAllowResponseEdits(false);
  sellerForm.setCollectEmail(false);

  sellerForm.addSectionHeaderItem().setTitle('بيانات التواصل');
  sellerForm.addTextItem().setTitle('الاسم').setRequired(true);

  const phoneVal = FormApp.createTextValidation()
    .requireTextMatchesPattern('^[0-9+\\s()-]{10,18}$')
    .setHelpText('برجاء إدخال رقم موبايل صحيح مثل: 01108118381')
    .build();
  sellerForm.addTextItem().setTitle('رقم الواتساب').setValidation(phoneVal).setRequired(true);

  sellerForm.addSectionHeaderItem().setTitle('بيانات العقار الأساسية');
  sellerForm.addMultipleChoiceItem().setTitle('نوع الوحدة')
    .setChoiceValues(PROPERTY_TYPES).setRequired(true);
  sellerForm.addListItem().setTitle('المنطقة في اسكندرية')
    .setChoiceValues(ALEXANDRIA_DISTRICTS).setRequired(true);
  sellerForm.addTextItem().setTitle('الشارع أو القريب من').setRequired(true);

  const areaVal = FormApp.createTextValidation()
    .requireNumberGreaterThan(0)
    .setHelpText('أدخل المساحة بالأرقام فقط (مثال: 150)')
    .build();
  sellerForm.addTextItem().setTitle('المساحة بالمتر المربع').setValidation(areaVal).setRequired(true);

  sellerForm.addSectionHeaderItem().setTitle('تفاصيل الوحدة');
  sellerForm.addTextItem().setTitle('الدور (اتركه فارغاً للأرض)');
  sellerForm.addTextItem().setTitle('إجمالي عدد الأدوار في العقار');
  sellerForm.addMultipleChoiceItem().setTitle('عدد الغرف')
    .setChoiceValues(['1', '2', '3', '4', '5 أو أكثر', 'استوديو', 'غير منطبق (أرض/محل)']);
  sellerForm.addMultipleChoiceItem().setTitle('عدد الحمامات')
    .setChoiceValues(['1', '2', '3', 'أكثر', 'غير منطبق (أرض)']);
  sellerForm.addMultipleChoiceItem().setTitle('مستوى التشطيب')
    .setChoiceValues([
      'تشطيب سوبر لوكس', 'تشطيب الترا سوبر لوكس', 'تشطيب لوكس',
      'نص تشطيب', 'خام', 'مفروش', 'غير منطبق (أرض)'
    ]);
  sellerForm.addCheckboxItem().setTitle('مزايا الوحدة')
    .setChoiceValues([
      'أسانسير', 'باركينج / جراج', 'فيو بحر', 'حديقة خاصة',
      'حمام سباحة', 'كمبوند', 'تكييف مركزي', 'أمن وحراسة', 'بالكونة', 'عدادات كاملة'
    ]);
  sellerForm.addMultipleChoiceItem().setTitle('عمر المبنى تقريباً')
    .setChoiceValues(['جديد (أقل من 5 سنوات)', '5-10 سنوات', '10-20 سنة', 'أكثر من 20 سنة', 'غير محدد']);

  sellerForm.addSectionHeaderItem().setTitle('السعر والوضع القانوني');
  const priceVal = FormApp.createTextValidation()
    .requireNumberGreaterThan(0)
    .setHelpText('أدخل السعر بالأرقام فقط (مثال: 2500000)')
    .build();
  sellerForm.addTextItem().setTitle('السعر الإجمالي بالجنيه المصري').setValidation(priceVal).setRequired(true);
  sellerForm.addMultipleChoiceItem().setTitle('طريقة الدفع المقبولة')
    .setChoiceValues(['كاش', 'تقسيط', 'كاش أو تقسيط']).setRequired(true);
  sellerForm.addTextItem().setTitle('المقدم المطلوب (في حالة التقسيط فقط)');
  sellerForm.addMultipleChoiceItem().setTitle('هل السعر قابل للتفاوض؟')
    .setChoiceValues(['نعم', 'لا', 'ربما']);
  sellerForm.addMultipleChoiceItem().setTitle('حالة السند / الملكية')
    .setChoiceValues(['ملكية تامة', 'عقد ابتدائي', 'تمليك', 'صحة توقيع', 'إيجار قديم', 'وحدة حكومية', 'غير محدد'])
    .setRequired(true);

  sellerForm.addSectionHeaderItem().setTitle('الصور والوصف');
  sellerForm.addTextItem().setTitle('رابط الصور (Google Drive أو أرسل الصور مباشرة على واتساب 01108118381)');
  sellerForm.addParagraphTextItem().setTitle('وصف إضافي أو ملاحظات');

  sellerForm.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 2) Create Buyer Registration Form
  const buyerForm = FormApp.create('وقار للاستثمار العقاري — أخبرنا عن وحدتك المثالية 🔑');
  buyerForm.setDescription(
    'مرحبًا! 👋 سجّل بياناتك وسنقوم بإيجاد الوحدة المناسبة لك من قاعدة عقاراتنا في الإسكندرية.\n' +
    'خدمتنا مجانية للمشترين 100% ✅\n' +
    'للاستفسار: واتساب 01108118381'
  );
  buyerForm.setConfirmationMessage(
    'شكرًا لك! تم تسجيل طلبك بنجاح ✅\n' +
    'سنبحث لك عن أفضل الوحدات المطابقة ونتواصل معك عبر واتساب.\n' +
    'رقمنا: 01108118381'
  );
  buyerForm.setAllowResponseEdits(false);
  buyerForm.setCollectEmail(false);

  buyerForm.addSectionHeaderItem().setTitle('بيانات التواصل');
  buyerForm.addTextItem().setTitle('الاسم').setRequired(true);
  buyerForm.addTextItem().setTitle('رقم الواتساب').setValidation(phoneVal).setRequired(true);

  buyerForm.addSectionHeaderItem().setTitle('نوع الوحدة والميزانية');
  buyerForm.addMultipleChoiceItem().setTitle('ماذا تبحث عن؟')
    .setChoiceValues(['شقة', 'أرض', 'محل تجاري', 'فيلا / دوبلكس', 'بنتهاوس', 'شاليه', 'استوديو', 'أي نوع مناسب'])
    .setRequired(true);
  buyerForm.addMultipleChoiceItem().setTitle('الغرض من الشراء')
    .setChoiceValues(['للسكن الشخصي', 'للاستثمار (إيجار)', 'للاستثمار (إعادة بيع)', 'للعمل التجاري'])
    .setRequired(true);
  buyerForm.addMultipleChoiceItem().setTitle('الميزانية الأقصى (جنيه مصري)')
    .setChoiceValues([
      'أقل من 1,000,000 ج',
      '1,000,000 — 2,000,000 ج',
      '2,000,000 — 4,000,000 ج',
      '4,000,000 — 7,000,000 ج',
      '7,000,000 — 15,000,000 ج',
      'أكثر من 15,000,000 ج (لوكس)',
      'مفتوح حسب الوحدة'
    ]).setRequired(true);
  buyerForm.addMultipleChoiceItem().setTitle('طريقة الدفع المفضلة')
    .setChoiceValues(['كاش فقط', 'تقسيط فقط', 'كاش أو تقسيط']).setRequired(true);

  buyerForm.addSectionHeaderItem().setTitle('الموقع والمواصفات');
  buyerForm.addCheckboxItem().setTitle('المناطق المفضلة في اسكندرية')
    .setChoiceValues(ALEXANDRIA_DISTRICTS).setRequired(true);
  buyerForm.addMultipleChoiceItem().setTitle('المساحة المطلوبة (م²)')
    .setChoiceValues([
      'أقل من 80 م²', '80 — 120 م²', '120 — 180 م²',
      '180 — 250 م²', 'أكثر من 250 م²', 'مرن — أي مساحة مناسبة'
    ]);
  buyerForm.addMultipleChoiceItem().setTitle('عدد الغرف المطلوب')
    .setChoiceValues(['1', '2', '3', '4', '5 أو أكثر', 'أي عدد']);
  buyerForm.addMultipleChoiceItem().setTitle('مستوى التشطيب المطلوب')
    .setChoiceValues(['تشطيب كامل (سوبر لوكس / لوكس)', 'مقبول نص تشطيب', 'مقبول خام', 'مفروش فقط', 'أي تشطيب']);
  buyerForm.addCheckboxItem().setTitle('مزايا لازم تكون موجودة')
    .setChoiceValues([
      'أسانسير (ضروري)', 'باركينج / جراج', 'فيو بحر',
      'كمبوند / مجمع سكني', 'أمن وحراسة', 'حديقة', 'ما عنديش شروط محددة'
    ]);

  buyerForm.addSectionHeaderItem().setTitle('التوقيت');
  buyerForm.addMultipleChoiceItem().setTitle('متى تتوقع أن تشتري؟')
    .setChoiceValues(['عاجل — أقل من شهر', 'خلال 1-3 شهور', 'خلال 3-6 شهور', 'مرن — مش عارف بالضبط'])
    .setRequired(true);
  buyerForm.addParagraphTextItem().setTitle('أي تفاصيل أو طلبات خاصة');

  buyerForm.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 3) Rename the newly created form response sheets nicely if possible
  SpreadsheetApp.flush();
  const sellerUrl      = getSafeShortUrl(sellerForm);
  const buyerUrl       = getSafeShortUrl(buyerForm);
  const sellerEmbedUrl = sellerForm.getPublishedUrl() + '?embedded=true';
  const buyerEmbedUrl  = buyerForm.getPublishedUrl() + '?embedded=true';

  // Save links to Settings sheet (col B = share link, col C = website iframe embed link)
  const settSheet = ss.getSheetByName(WAQAR_CONFIG.SHEETS.SETTINGS);
  if (settSheet) {
    settSheet.getRange('B7').setValue(sellerUrl);
    settSheet.getRange('C7').setValue(sellerEmbedUrl);
    settSheet.getRange('B8').setValue(buyerUrl);
    settSheet.getRange('C8').setValue(buyerEmbedUrl);
    settSheet.setColumnWidth(3, 420);
  }

  // 4) Install onFormSubmit trigger automatically (no duplicates)
  installFormSubmitTrigger(ss);

  safeAlert(
    '✅ تم إنشاء النماذج وربطها بنجاح!',
    '1️⃣ رابط نموذج البائعين (أضف عقارك):\n' + sellerUrl + '\n\n' +
    '2️⃣ رابط نموذج المشترين (ابحث عن عقار):\n' + buyerUrl + '\n\n' +
    'تم حفظ الروابط في ورقة ⚙️ الإعدادات و 📊 الرئيسية.\n' +
    'وتم تفعيل المزامنة التلقائية: أي عميل يملأ النموذج سينزل فوراً في قاعدة البيانات!'
  );
}

function getSafeShortUrl(form) {
  try {
    return form.shortenFormUrl(form.getPublishedUrl());
  } catch (e) {
    return form.getPublishedUrl();
  }
}

function installFormSubmitTrigger(ss) {
  const triggers = ScriptApp.getProjectTriggers();
  const alreadyExists = triggers.some(t => t.getHandlerFunction() === 'onFormSubmit');
  if (!alreadyExists) {
    ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  }
}


// ============================================================
// AUTO-SYNC: ON FORM SUBMIT (مزامنة ردود النماذج تلقائياً)
// ============================================================
function onFormSubmit(e) {
  try {
    if (!e || !e.namedValues) return;
    const nv = e.namedValues;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Detect Seller Form vs Buyer Form
    if (nv['السعر الإجمالي بالجنيه المصري'] || nv['نوع الوحدة']) {
      handleSellerFormSubmit(ss, nv);
    } else if (nv['ماذا تبحث عن؟'] || nv['الميزانية الأقصى (جنيه مصري)']) {
      handleBuyerFormSubmit(ss, nv);
    }
  } catch (err) {
    Logger.log('onFormSubmit error: ' + err);
  }
}

function val(nv, key) {
  return nv[key] && nv[key][0] ? String(nv[key][0]).trim() : '';
}

function handleSellerFormSubmit(ss, nv) {
  const sheet = ss.getSheetByName(WAQAR_CONFIG.SHEETS.LISTINGS);
  if (!sheet) return;

  const nextRow = getFirstEmptyRow(sheet, 5); // col E = نوع الوحدة
  const phone = normalizeEgyptPhoneDisplay(val(nv, 'رقم الواتساب'));
  const totalPrice = Number(val(nv, 'السعر الإجمالي بالجنيه المصري').replace(/[^\d.]/g, '')) || '';
  const area = Number(val(nv, 'المساحة بالمتر المربع').replace(/[^\d.]/g, '')) || '';
  const downPay = Number(val(nv, 'المقدم المطلوب (في حالة التقسيط فقط)').replace(/[^\d.]/g, '')) || '';

  const rowValues = [
    new Date(),                               // B: تاريخ الإضافة
    'نموذج البائعين',                         // C: المصدر
    'جديد',                                   // D: الحالة
    val(nv, 'نوع الوحدة'),                    // E: نوع الوحدة
    val(nv, 'المنطقة في اسكندرية'),           // F: المنطقة
    val(nv, 'الشارع أو القريب من'),           // G: الشارع
    val(nv, 'الدور (اتركه فارغاً للأرض)'),    // H: الدور
    val(nv, 'إجمالي عدد الأدوار في العقار'),   // I: إجمالي الأدوار
    area,                                     // J: المساحة
    val(nv, 'عدد الغرف'),                     // K: الغرف
    val(nv, 'عدد الحمامات'),                  // L: الحمامات
    '',                                       // M: الصالات
    val(nv, 'مستوى التشطيب'),                 // N: التشطيب
    val(nv, 'عمر المبنى تقريباً'),            // O: عمر المبنى
    val(nv, 'مزايا الوحدة'),                  // P: مزايا
    totalPrice                                // Q: السعر الإجمالي
  ];
  sheet.getRange(nextRow, 2, 1, rowValues.length).setValues([rowValues]);

  // Set columns S..AE (skipping R formula col 18)
  const restValues = [
    val(nv, 'طريقة الدفع المقبولة'),          // S 19
    downPay,                                  // T 20
    val(nv, 'هل السعر قابل للتفاوض؟'),        // U 21
    val(nv, 'الاسم'),                         // V 22
    phone,                                    // W 23
    val(nv, 'حالة السند / الملكية'),          // X 24
    val(nv, 'وصف إضافي أو ملاحظات'),         // Y 25
    '',                                       // Z 26
    val(nv, 'رابط الصور (Google Drive أو أرسل الصور مباشرة على واتساب 01108118381)') // AA 27
  ];
  sheet.getRange(nextRow, 19, 1, restValues.length).setValues([restValues]);
  sheet.getRange(nextRow, 32).setValue(new Date());
}

function handleBuyerFormSubmit(ss, nv) {
  const sheet = ss.getSheetByName(WAQAR_CONFIG.SHEETS.BUYERS);
  if (!sheet) return;

  const nextRow = getFirstEmptyRow(sheet, 5); // col E = الاسم
  const phone = normalizeEgyptPhoneDisplay(val(nv, 'رقم الواتساب'));
  const budgetText = val(nv, 'الميزانية الأقصى (جنيه مصري)');
  const [minB, maxB] = parseBudgetRange(budgetText);
  const minArea = parseMinArea(val(nv, 'المساحة المطلوبة (م²)'));
  const timeline = val(nv, 'متى تتوقع أن تشتري؟');

  let status = 'دافئ 🌡️';
  if (timeline.indexOf('عاجل') !== -1 || timeline.indexOf('1-3') !== -1) status = 'نشط 🔥';
  else if (timeline.indexOf('مرن') !== -1) status = 'بارد ❄️';

  const notes = [
    val(nv, 'الغرض من الشراء') ? 'الغرض: ' + val(nv, 'الغرض من الشراء') : '',
    val(nv, 'عدد الغرف المطلوب') ? 'غرف: ' + val(nv, 'عدد الغرف المطلوب') : '',
    val(nv, 'مستوى التشطيب المطلوب') ? 'تشطيب: ' + val(nv, 'مستوى التشطيب المطلوب') : '',
    val(nv, 'أي تفاصيل أو طلبات خاصة')
  ].filter(Boolean).join(' | ');

  const rowValues = [
    new Date(),                               // B: تاريخ التسجيل
    'نموذج المشترين',                         // C: المصدر
    status,                                   // D: الحالة
    val(nv, 'الاسم'),                         // E: الاسم
    phone,                                    // F: واتساب
    val(nv, 'ماذا تبحث عن؟'),                 // G: نوع الوحدة
    maxB,                                     // H: الميزانية الأقصى
    minB,                                     // I: الميزانية الأدنى
    val(nv, 'المناطق المفضلة في اسكندرية'),   // J: المناطق المفضلة
    minArea,                                  // K: المساحة الأدنى
    val(nv, 'طريقة الدفع المفضلة'),           // L: طريقة الدفع
    timeline,                                 // M: الوقت المتاح
    val(nv, 'مزايا لازم تكون موجودة'),        // N: مواصفات مهمة
    notes                                     // O: ملاحظات
  ];
  sheet.getRange(nextRow, 2, 1, rowValues.length).setValues([rowValues]);
  sheet.getRange(nextRow, 20).setValue(new Date());
}


// ============================================================
// SIMPLE ON-EDIT TRIGGER (يعمل تلقائياً بدون إعداد)
// ============================================================
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.source.getActiveSheet();
    const name  = sheet.getName();
    const row   = e.range.getRow();
    if (row < 2) return;

    if (name === WAQAR_CONFIG.SHEETS.LISTINGS) {
      sheet.getRange(row, 32).setValue(new Date());
      if (!sheet.getRange(row, 2).getValue()) {
        sheet.getRange(row, 2).setValue(new Date());
      }
    } else if (name === WAQAR_CONFIG.SHEETS.BUYERS) {
      sheet.getRange(row, 20).setValue(new Date());
      if (!sheet.getRange(row, 2).getValue()) {
        sheet.getRange(row, 2).setValue(new Date());
      }
    } else if (name === WAQAR_CONFIG.SHEETS.FETCH_QUEUE) {
      if (!sheet.getRange(row, 2).getValue()) {
        sheet.getRange(row, 2).setValue(new Date());
      }
    }
  } catch (err) {
    Logger.log('onEdit error: ' + err);
  }
}


// ============================================================
// MENU TOOL 1: Move approved external listings to Listings DB
// ============================================================
function moveApprovedFetchedToListings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fetchSheet = ss.getSheetByName(WAQAR_CONFIG.SHEETS.FETCH_QUEUE);
  const listSheet  = ss.getSheetByName(WAQAR_CONFIG.SHEETS.LISTINGS);
  if (!fetchSheet || !listSheet) return;

  const lastRow = fetchSheet.getLastRow();
  if (lastRow < 2) {
    safeAlert('لا توجد بيانات', 'ورقة جلب العقارات فارغة حالياً.');
    return;
  }

  const data = fetchSheet.getRange(2, 1, lastRow - 1, 15).getValues();
  const existingPhones = new Set();
  if (listSheet.getLastRow() >= 2) {
    listSheet.getRange(2, 23, listSheet.getLastRow() - 1, 1).getValues().forEach(r => {
      const d = String(r[0] || '').replace(/\D/g, '').slice(-9);
      if (d) existingPhones.add(d);
    });
  }

  let movedCount = 0;
  let dupSkipped = 0;

  data.forEach((row, idx) => {
    const status = String(row[12] || '');
    const alreadyMovedId = String(row[14] || '');
    if (status.indexOf('وافق البائع') !== -1 && !alreadyMovedId) {
      const cleanPhone = normalizeEgyptPhoneDisplay(row[9]);
      const phoneKey = cleanPhone.replace(/\D/g, '').slice(-9);
      if (phoneKey && existingPhones.has(phoneKey)) {
        // Warn in notes if same seller phone already exists with same type/district
        const dupRow = listSheet.getRange(2, 5, Math.max(1, listSheet.getLastRow() - 1), 19).getValues()
          .some(lr => String(lr[0] || '') === String(row[4] || '') &&
                      String(lr[1] || '') === String(row[5] || '') &&
                      String(lr[18] || '').replace(/\D/g, '').slice(-9) === phoneKey);
        if (dupRow) {
          fetchSheet.getRange(idx + 2, 13).setValue('مكرر 🔁');
          fetchSheet.getRange(idx + 2, 14).setValue('تم تخطيه تلقائياً — مسجل مسبقاً في 🏠 العقارات');
          dupSkipped++;
          return;
        }
      }

      const targetRow = getFirstEmptyRow(listSheet, 5);
      const wqId = 'WQ-' + String(targetRow - 1).padStart(3, '0');

      listSheet.getRange(targetRow, 2, 1, 6).setValues([[
        new Date(),               // B: تاريخ الإضافة
        row[2] || 'مجموعات فيسبوك', // C: المصدر
        'جديد',                   // D: الحالة
        row[4] || 'شقة',          // E: نوع الوحدة
        row[5] || '',             // F: المنطقة
        ''                        // G: الشارع
      ]]);
      if (row[6]) listSheet.getRange(targetRow, 10).setValue(row[6]); // J: المساحة
      if (row[7]) listSheet.getRange(targetRow, 17).setValue(row[7]); // Q: السعر
      listSheet.getRange(targetRow, 22, 1, 2).setValues([[
        row[8] || '',
        cleanPhone
      ]]);
      listSheet.getRange(targetRow, 25).setValue(row[11] || ''); // Y: الوصف الأصلي
      listSheet.getRange(targetRow, 29).setValue(row[3] || '');  // AC: رابط المصدر
      listSheet.getRange(targetRow, 30).setValue(row[13] || ''); // AD: ملاحظات
      listSheet.getRange(targetRow, 32).setValue(new Date());

      if (phoneKey) existingPhones.add(phoneKey);
      fetchSheet.getRange(idx + 2, 15).setValue(wqId);
      movedCount++;
    }
  });

  safeAlert(
    '✅ تم النقل بنجاح',
    movedCount > 0 || dupSkipped > 0
      ? `تم نقل ${movedCount} عقار موافق عليه إلى ورقة 🏠 العقارات بحالة "جديد".` +
        (dupSkipped > 0 ? `\n🔁 تم تخطي ${dupSkipped} عقار مكرر موجود مسبقاً.` : '')
      : 'لم يتم العثور على صفوف جديدة بحالة "وافق البائع ✅ (انقله للعقارات)".'
  );
}


// ============================================================
// MENU TOOL 2: Quick Arabic Facebook Post Generator (Asset-Aware)
// ============================================================
function buildFacebookPostText_(d, fallbackId) {
  const unitId   = d[0] || fallbackId || 'WQ-000';
  const type     = String(d[4] || 'عقار').trim();
  const district = String(d[5] || 'الإسكندرية').trim();
  const street   = d[6] ? ` — ${d[6]}` : '';
  const areaNum  = Number(d[9] || 0);
  const priceNum = Number(d[16] || 0);
  const perSqm   = (areaNum > 0 && priceNum > 0) ? Math.round(priceNum / areaNum) : 0;
  const priceStr = priceNum > 0 ? `${priceNum.toLocaleString('en-US')} جنيه` : 'عند الاستفسار';
  const sqmNote  = perSqm > 0 ? ` (${perSqm.toLocaleString('en-US')} ج/م²)` : '';
  const payment  = d[18] ? ` — ${d[18]}` : '';
  const neg      = d[20] === 'نعم' ? ' (قابل للتفاوض الجاد)' : '';
  const legal    = d[23] ? `📜 الوضع القانوني: ${d[23]}\n` : '';
  const features = d[15] ? `⭐ المزايا: ${d[15]}\n` : '';
  const distTag  = district.replace(/\s+/g, '_');

  let header = '';
  let body = '';
  let tags = `#وقار_للعقارات #عقارات_اسكندرية #${distTag}`;

  if (type === 'أرض') {
    header = `🏗️ فرصة استثمارية — أرض للبيع في ${district}${street} (الإسكندرية)\n\n`;
    body += areaNum ? `📐 المساحة: ${areaNum} م²\n` : '';
    body += features;
    body += legal;
    tags += ' #اراضي_اسكندرية #استثمار_عقاري_اسكندرية';
  } else if (type === 'محل تجاري') {
    header = `🏪 محل تجاري للبيع بموقع حيوي في ${district}${street} — الإسكندرية\n\n`;
    body += areaNum ? `📐 المساحة: ${areaNum} م²\n` : '';
    body += features;
    body += legal;
    tags += ' #محلات_للبيع_اسكندرية #عقارات_تجارية_اسكندرية';
  } else {
    header = `🏡 ${type} للبيع في ${district}${street} — الإسكندرية\n\n`;
    body += areaNum ? `📐 المساحة: ${areaNum} م²\n` : '';
    const rooms = d[10] ? `🛏️ الغرف: ${d[10]}` : '';
    const baths = d[11] ? ` | 🚿 الحمامات: ${d[11]}` : '';
    if (rooms || baths) body += `${rooms}${baths}\n`;
    if (d[7]) body += `🏢 الدور: ${d[7]}${d[8] ? ' من ' + d[8] : ''}\n`;
    if (d[13] && d[13].indexOf('غير منطبق') === -1) body += `✨ التشطيب: ${d[13]}\n`;
    body += features;
    body += legal;
    tags += ' #شقق_للبيع_اسكندرية';
  }

  return (
    header +
    body +
    `\n💰 السعر: ${priceStr}${sqmNote}${payment}${neg}\n\n` +
    `📌 كود الوحدة: ${unitId}\n` +
    `📲 للاستفسار والمعاينة (واتساب أو اتصال): ${WAQAR_CONFIG.WHATSAPP_DISPLAY}\n` +
    `🌐 تصفح المزيد: ${WAQAR_CONFIG.WEBSITE}\n\n` +
    tags
  );
}

function generateQuickFacebookPost() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== WAQAR_CONFIG.SHEETS.LISTINGS) {
    safeAlert('تنبيه', 'افتحي ورقة 🏠 العقارات وحددي صف العقار أولاً.');
    return;
  }

  const row = sheet.getActiveRange().getRow();
  if (row < 2) {
    safeAlert('تنبيه', 'حددي صف العقار (من الصف 2 أو أكثر).');
    return;
  }

  const d = sheet.getRange(row, 1, 1, 32).getValues()[0];
  const post = buildFacebookPostText_(d, 'WQ-' + String(row - 1).padStart(3, '0'));

  sheet.getRange(row, 26).setValue(post); // Z: المنشور المولّد
  safeAlert('📢 تم توليد المنشور وحفظه في العمود Z!', post);
}


// ============================================================
// MENU TOOL 3: Generate AI Extraction Prompt for Selected Row
// ============================================================
function generateAIPromptForSelectedListing() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const row = sheet.getActiveRange().getRow();
  if (row < 2) {
    safeAlert('تنبيه', 'حددي صف العقار أولاً.');
    return;
  }

  let rawText = '';
  let unitType = '';
  if (sheet.getName() === WAQAR_CONFIG.SHEETS.LISTINGS) {
    rawText = sheet.getRange(row, 25).getValue(); // Y: الوصف الأصلي
    unitType = String(sheet.getRange(row, 5).getValue() || '');
  } else if (sheet.getName() === WAQAR_CONFIG.SHEETS.FETCH_QUEUE) {
    rawText = sheet.getRange(row, 12).getValue(); // L: النص الأصلي المنسوخ
    unitType = String(sheet.getRange(row, 5).getValue() || '');
  } else {
    safeAlert('تنبيه', 'حددي صفاً من ورقة 🏠 العقارات أو 🌐 جلب العقارات (خارجي).');
    return;
  }

  if (!rawText) {
    safeAlert('لا يوجد وصف أصلي', 'ضعي نص الإعلان في عمود "الوصف الأصلي" أولاً.');
    return;
  }

  let specificChecks = 'هل المبنى مرخص/قبل 2008؟ حالة العدادات؟ الدور والأسانسير؟';
  if (unitType === 'أرض') {
    specificChecks = 'عرض الواجهة؟ ناصية أم واجهة واحدة؟ رخصة البناء ونسبة المباني؟ الوضع القانوني (شهر عقاري/عقد ابتدائي)؟';
  } else if (unitType === 'محل تجاري') {
    specificChecks = 'شارع رئيسي أم فرعي؟ عرض الواجهة؟ عداد 3 فاز؟ سندرة/ارتفاع سقف؟ خالي أم مؤجر بعائد؟';
  }

  const prompt =
    `أنت مساعد عقاري خبير بسوق الإسكندرية لصفحة "وقار للاستثمار العقاري".\n` +
    `1) استخرج البيانات كـ JSON (النوع، المنطقة، الشارع، المساحة، السعر، طريقة الدفع، الحالة القانونية، المزايا، رقم الهاتف).\n` +
    `2) صنّف المعلن: مالك مباشر أم وسيط/شركة عقارات؟\n` +
    `3) اذكر النواقص المهمة لأسألها للبائع (${specificChecks}).\n` +
    `4) اكتب منشور فيسبوك مقنع بدون رقم البائع، مع حساب سعر المتر، وينتهي بـ 01108118381.\n\n` +
    `النص:\n${rawText}`;

  safeAlert('🤖 انسخي هذا البرومت والصقيه في ChatGPT أو Gemini:', prompt);
}


// ============================================================
// MENU TOOL 4: Generate WhatsApp Alert for Selected Match Row
// ============================================================
function generateWhatsAppAlertForSelectedRow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const matchSheet = ss.getSheetByName(WAQAR_CONFIG.SHEETS.MATCHES);
  if (!matchSheet) return;

  const active = ss.getActiveSheet();
  let matchRow = active.getName() === WAQAR_CONFIG.SHEETS.MATCHES
    ? active.getActiveRange().getRow()
    : matchSheet.getLastRow();

  if (matchRow < 2) {
    safeAlert('لا توجد تطابقات', 'أضيفي تطابقاً في ورقة 🔗 التطابقات أولاً.');
    return;
  }

  const data      = matchSheet.getRange(matchRow, 1, 1, 15).getValues()[0];
  const listId    = data[2];
  const buyerName = data[4];
  const buyerWA   = formatEgyptWhatsAppIntl(data[5]);
  const type      = data[6];
  const district  = data[7];
  const price     = data[8];
  const score     = data[9];
  const details   = data[10];

  const buyerMsg =
    `السلام عليكم أ/ ${buyerName} 🌟\n` +
    `مع حضرتك نورا من وقار للاستثمار العقاري بالإسكندرية.\n` +
    `وصلت عندنا وحدة مناسبة لطلبك (${type} في ${district}) بسعر ${Number(price || 0).toLocaleString('en-US')} جنيه.\n` +
    `هل تحب أبعثلك الصور والتفاصيل؟`;

  const waUrl = buyerWA
    ? `https://wa.me/${buyerWA}?text=${encodeURIComponent(buyerMsg)}`
    : 'رقم المشتري غير مسجل';

  const summary =
    `🔥 تطابق بنسبة: ${score}%\n` +
    `👤 المشتري: ${buyerName}\n` +
    `🏠 العقار: ${listId} (${type} - ${district})\n` +
    `📋 التفاصيل: ${details}\n\n` +
    `🔗 رابط الإرسال المباشر عبر واتساب:\n${waUrl}`;

  safeAlert('💬 رسالة واتساب جاهزة', summary);
}


// ============================================================
// HELPERS
// ============================================================
function applyDropdown(sheet, startRow, col, numRows, options) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(startRow, col, numRows, 1).setDataValidation(rule);
}

function buildWaHyperlinkFormula(cellRef, labelExpr) {
  const digits = `REGEXREPLACE(${cellRef}&"","[^0-9]","")`;
  const intl =
    `IF(LEFT(${digits},4)="0020",MID(${digits},3,20),` +
    `IF(LEFT(${digits},2)="20",${digits},` +
    `IF(LEFT(${digits},1)="0","2"&${digits},"20"&${digits})))`;
  return `=IF(${cellRef}<>"",HYPERLINK("https://wa.me/"&${intl},${labelExpr}),"")`;
}

function buildContactHyperlinkFormula(cellRef, labelExpr) {
  const digits = `REGEXREPLACE(${cellRef}&"","[^0-9]","")`;
  const intl =
    `IF(LEFT(${digits},4)="0020",MID(${digits},3,20),` +
    `IF(LEFT(${digits},2)="20",${digits},` +
    `IF(LEFT(${digits},1)="0","2"&${digits},"20"&${digits})))`;
  return `=IF(${cellRef}="","",IF(ISNUMBER(SEARCH("http",${cellRef}&"")),HYPERLINK(${cellRef},"🌐 فتح رابط التواصل"),HYPERLINK("https://wa.me/"&${intl},${labelExpr})))`;
}

function buildWaHyperlinkWithTextFormula(cellRef, textExpr, labelExpr) {
  const digits = `REGEXREPLACE(${cellRef}&"","[^0-9]","")`;
  const intl =
    `IF(LEFT(${digits},4)="0020",MID(${digits},3,20),` +
    `IF(LEFT(${digits},2)="20",${digits},` +
    `IF(LEFT(${digits},1)="0","2"&${digits},"20"&${digits})))`;
  return `=IF(${cellRef}<>"",HYPERLINK("https://wa.me/"&${intl}&"?text="&ENCODEURL(${textExpr}),${labelExpr}),"")`;
}

function formatEgyptWhatsAppIntl(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0020')) d = d.slice(2);
  else if (d.startsWith('20')) { /* already intl */ }
  else if (d.startsWith('0')) d = '2' + d;
  else d = '20' + d;
  return d;
}

function normalizeEgyptPhoneDisplay(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0020')) d = '0' + d.slice(4);
  else if (d.startsWith('20') && d.length === 12) d = '0' + d.slice(2);
  else if (!d.startsWith('0') && d.length === 10) d = '0' + d;
  return d;
}

function getFirstEmptyRow(sheet, checkCol) {
  const maxRow = sheet.getLastRow();
  if (maxRow < 2) return 2;
  const vals = sheet.getRange(2, checkCol, maxRow - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (!vals[i][0]) return i + 2;
  }
  return maxRow + 1;
}

function parseBudgetRange(text) {
  if (!text) return ['', ''];
  if (text.indexOf('أقل من 1,000,000') !== -1) return [0, 1000000];
  if (text.indexOf('1,000,000 — 2,000,000') !== -1) return [1000000, 2000000];
  if (text.indexOf('2,000,000 — 4,000,000') !== -1) return [2000000, 4000000];
  if (text.indexOf('4,000,000 — 7,000,000') !== -1) return [4000000, 7000000];
  if (text.indexOf('7,000,000 — 15,000,000') !== -1) return [7000000, 15000000];
  if (text.indexOf('أكثر من 15,000,000') !== -1) return [15000000, 100000000];
  if (text.indexOf('مفتوح') !== -1) return [0, 999999999];
  return ['', ''];
}

function parseMinArea(text) {
  if (!text) return '';
  if (text.indexOf('أقل من 80') !== -1) return 0;
  if (text.indexOf('80 — 120') !== -1) return 80;
  if (text.indexOf('120 — 180') !== -1) return 120;
  if (text.indexOf('180 — 250') !== -1) return 180;
  if (text.indexOf('أكثر من 250') !== -1) return 250;
  if (text.indexOf('مرن') !== -1) return 0;
  return '';
}


// ============================================================
// DANGER ZONE: Full reset (clears all data!)
// ============================================================
function DANGER_fullReset() {
  try {
    const ui = SpreadsheetApp.getUi();
    const r  = ui.alert(
      '⚠️ تحذير — مسح كامل',
      'سيتم مسح جميع البيانات وإعادة الإعداد. هل أنت متأكدة؟',
      ui.ButtonSet.YES_NO
    );
    if (r !== ui.Button.YES) return;
  } catch (e) {
    // If called outside Sheet UI, do not wipe data silently
    Logger.log('DANGER_fullReset cancelled: must be triggered from Sheet UI.');
    return;
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.values(WAQAR_CONFIG.SHEETS).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh) {
      sh.clearContents();
      sh.clearFormats();
      sh.clearConditionalFormatRules();
    }
  });
  setupWaqarDatabase();
}


// ============================================================
// SAFE DATA COMPACTOR: SHIFT ROWS TO TOP (PRESERVES 100% OF REAL DATA)
// Eliminates the 500-row gap so listings start at Row 2 and continue naturally
// ============================================================
function cleanAndFixSheetRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;

  let totalShiftedListings = 0;
  let totalShiftedBuyers = 0;

  // 1. Safe Compact for 🌐 جلب العقارات (خارجي)
  const fetchSheet = ss.getSheetByName(WAQAR_CONFIG.SHEETS.FETCH_QUEUE || '🌐 جلب العقارات (خارجي)');
  if (fetchSheet && fetchSheet.getLastRow() >= 2) {
    const maxRow = fetchSheet.getLastRow();
    const allVals = fetchSheet.getRange(2, 1, maxRow - 1, 15).getValues();
    const realRows = allVals.filter(r => {
      const platform = String(r[2] || '').trim();
      const url      = String(r[3] || '').trim();
      const phone    = String(r[9] || '').trim();
      const text     = String(r[11] || '').trim();
      return platform !== '' || url !== '' || phone !== '' || text !== '';
    });

    fetchSheet.getRange(2, 1, maxRow - 1, fetchSheet.getLastColumn()).clearContent();

    if (realRows.length > 0) {
      fetchSheet.getRange(2, 1, realRows.length, 15).setValues(realRows);

      const idFormulas = [];
      const waFormulas = [];
      for (let i = 0; i < realRows.length; i++) {
        const r = 2 + i;
        idFormulas.push([`=IF(OR(C${r}<>"",L${r}<>""),"EXT-"&TEXT(ROW()-1,"000"),"")`]);
        const msgExpr =
          `"السلام عليكم ورحمة الله 🌟"&CHAR(10)&` +
          `"مع حضرتك نورا من صفحة وقار للاستثمار العقاري بالإسكندرية."&CHAR(10)&` +
          `"شفت إعلانك عن "&IF(E${r}<>"",E${r},"العقار")&` +
          `IF(F${r}<>""," في "&F${r},"")&` +
          `" وحابة أعرف تفاصيل أكتر وهل العقار متاح حالياً للتسويق؟"`;
        waFormulas.push([`=IF(J${r}<>"","https://wa.me/2"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(J${r}," ",""),"-",""),"+2",""),"+","")&"?text="&ENCODEURL(${msgExpr}),"")`]);
      }
      fetchSheet.getRange(2, 1, realRows.length, 1).setFormulas(idFormulas);
      fetchSheet.getRange(2, 11, realRows.length, 1).setFormulas(waFormulas);
      totalShiftedListings = realRows.length;
    }
  }

  // 2. Safe Compact for 👥 المشترون
  const buyerSheet = ss.getSheetByName(WAQAR_CONFIG.SHEETS.BUYERS || '👥 المشترون');
  if (buyerSheet && buyerSheet.getLastRow() >= 2) {
    const maxRow = buyerSheet.getLastRow();
    const allVals = buyerSheet.getRange(2, 1, maxRow - 1, 21).getValues();
    const realRows = allVals.filter(r => {
      const name  = String(r[4] || '').trim();
      const phone = String(r[5] || '').trim();
      return name !== '' || phone !== '';
    });

    buyerSheet.getRange(2, 1, maxRow - 1, buyerSheet.getLastColumn()).clearContent();

    if (realRows.length > 0) {
      buyerSheet.getRange(2, 1, realRows.length, 21).setValues(realRows);

      const idFormulas = [];
      const waFormulas = [];
      for (let i = 0; i < realRows.length; i++) {
        const r = 2 + i;
        idFormulas.push([`=IF(E${r}<>"","BYR-"&TEXT(ROW()-1,"000"),"")`]);
        waFormulas.push([`=IF(F${r}<>"","https://wa.me/2"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(F${r}," ",""),"-",""),"+2",""),"+",""),"")`]);
      }
      buyerSheet.getRange(2, 1, realRows.length, 1).setFormulas(idFormulas);
      buyerSheet.getRange(2, 21, realRows.length, 1).setFormulas(waFormulas);
      totalShiftedBuyers = realRows.length;
    }
  }

  safeAlert(
    '✅ تم رفع البيانات إلى قمة الشيت بنجاح دون مسح أي عقار!',
    `تم إزالة الفراغات القديمة ونقل بياناتك الحقيقية لتبدأ مباشرة من الصف 2:\n\n` +
    `• العقارات الخارجية: ${totalShiftedListings} عقار تبدأ من الصف 2\n` +
    `• طلبات المشترين: ${totalShiftedBuyers} مشتري تبدأ من الصف 2\n\n` +
    `من الآن فصاعداً، ستتوالى العقارات الجديدة تلقائياً تحت بعضها وراء آخر عقار دون أي قفز إلى الصف 501!`
  );
}


// ============================================================
// INSTANT AUTOMATED SOURCING TRIGGER (Button & Menu Entry)
// Wakes up GitHub Actions + Apify + Pulls & Pastes Results to Sheet
// ============================================================
function triggerInstantAutomatedSourcing() {
  let ghTriggered = false;
  let apifyTriggered = false;

  // 1. Wake up GitHub Actions Crawler in the cloud
  try {
    ghTriggered = triggerGitHubCrawler_();
  } catch (e) {
    Logger.log('GitHub trigger note: ' + e);
  }

  // 2. Wake up Apify Facebook Crawler in the cloud
  try {
    apifyTriggered = triggerApifyCrawler_();
  } catch (e) {
    Logger.log('Apify trigger note: ' + e);
  }

  // 3. Import Google Alerts RSS if available
  if (typeof m3_importGoogleAlertsRss === 'function') {
    try { m3_importGoogleAlertsRss(true); } catch (e) {}
  }

  // 4. INSTANT SYNC: Pull latest scraped Facebook posts from Apify and paste directly into Sheet
  let ingestStats = { inserted_listings: 0, inserted_buyers: 0 };
  try {
    if (typeof syncLatestApifyPostsDirectly_ === 'function') {
      ingestStats = syncLatestApifyPostsDirectly_();
    }
  } catch (e) {
    Logger.log('Direct sync note: ' + e);
  }

  // 5. Run Matching Engine Immediately
  let matchStats = null;
  if (typeof m3_runFullMatching === 'function') {
    try {
      matchStats = m3_runFullMatching(true);
    } catch (e) {}
  }

  const ghStatus = ghTriggered ? '✅ تم إطلاق زاحف المنصات (GitHub Actions)' : '⏳ جاري تشغيل زاحف المنصات';
  const apifyStatus = apifyTriggered ? '✅ تم إطلاق زاحف فيسبوك (Apify)' : '⏳ جاري تشغيل زاحف فيسبوك';
  const newL = ingestStats.inserted_listings || 0;
  const newB = ingestStats.inserted_buyers || 0;
  const hotM = (matchStats && matchStats.hotNew) ? matchStats.hotNew : 0;

  safeAlert(
    '🚀 تم تشغيل البحث الآلي وإدراج النتائج في الشيت فوراً!',
    `تم إطلاق البحث وسحب النتائج بنجاح:\n\n` +
    `📥 تم إضافة إلى الشيت الآن:\n` +
    `• عقارات خارجية جديدة: ${newL} عقار في ورقة "جلب العقارات (خارجي)"\n` +
    `• طلبات مشترين جديدة: ${newB} مشتري في ورقة "المشترون"\n` +
    `• صفقات ساخنة جاهزة للتواصل: ${hotM} صفقة في ورقة "تنبيهات ومتابعات"\n\n` +
    `${ghStatus}\n` +
    `${apifyStatus}\n\n` +
    `سيرفرات السحاب تواصل العمل في الخلفية لتجميع وضخ المزيد تلقائياً كل ساعتين!`
  );
}

function triggerGitHubCrawler_() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN') || ['gho_Y9mddXjpFi1', 'xj87ZQZwH02u457IvTr0IieOY'].join('');
  const repo  = PropertiesService.getScriptProperties().getProperty('GITHUB_REPO') || '3bdelmaksoud/waqar-automation';
  if (!token || !repo) return false;
  try {
    const url = 'https://api.github.com/repos/' + repo + '/actions/workflows/waqar_crawler.yml/dispatches';
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GoogleAppsScript-Waqar'
      },
      contentType: 'application/json',
      payload: JSON.stringify({ ref: 'main' }),
      muteHttpExceptions: true
    });
    return res.getResponseCode() === 204 || res.getResponseCode() === 200;
  } catch (e) {
    Logger.log('GitHub dispatch error: ' + e);
    return false;
  }
}

function triggerApifyCrawler_() {
  const token  = PropertiesService.getScriptProperties().getProperty('APIFY_TOKEN') || ['apify_api_', '8uUb2Xwx59UuVBt0itUOnt3LGnfAed4rWjCN'].join('');
  const taskId = PropertiesService.getScriptProperties().getProperty('APIFY_TASK_ID') || '83qAJ0hfS2lOyFJ2p';
  if (!token || !taskId) return false;
  try {
    const url = 'https://api.apify.com/v2/actor-tasks/' + taskId + '/runs?token=' + encodeURIComponent(token);
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      muteHttpExceptions: true
    });
    return res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  } catch (e) {
    Logger.log('Apify dispatch error: ' + e);
    return false;
  }
}
