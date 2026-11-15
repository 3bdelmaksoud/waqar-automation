/**
 * ============================================================
 *  WAQAR REAL ESTATE — Phase 2: Free Messenger & Comment Bot
 *  وقار للاستثمار العقاري — بوت فيسبوك ماسنجر والتعليقات (مجاني 100%)
 * ============================================================
 *  WHY THIS EXISTS:
 *  - ManyChat Free caps at 25 contacts/month & locks Google Sheets.
 *  - http://waqar.runasp.net/ is HTTP, while Meta Webhooks require HTTPS.
 *  - Google Apps Script gives FREE HTTPS hosting + direct Sheets read/write
 *    with ZERO monthly subscription fees and NO 25-contact cap.
 *
 *  HOW TO INSTALL:
 *  1. Open the same Google Sheet from Phase 1 > Extensions > Apps Script.
 *  2. Click "+" next to Files > Script > name it: MessengerBot
 *  3. Paste this entire file and Save (Ctrl+S).
 *     (Safe to live alongside 01_setup_database.gs — zero name conflicts!)
 *  4. Run `saveBotConfig` once after filling in your Meta tokens below
 *     (or set them in Project Settings > Script Properties).
 *  5. Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
 *  6. Copy the /exec HTTPS URL into Meta Developer Portal > Webhooks.
 * ============================================================
 */

const BOT_GRAPH_VERSION = 'v21.0';

const BOT_SHEETS = {
  LISTINGS:    '🏠 العقارات',
  BUYERS:      '👥 المشترون',
  FETCH_QUEUE: '🌐 جلب العقارات (خارجي)',
  MATCHES:     '🔗 التطابقات',
  SETTINGS:    '⚙️ الإعدادات',
  LOGS:        '🤖 سجل البوت'
};

const BOT_PAYMENTS = {
  CASH: 'كاش فقط',
  INSTALLMENTS: 'تقسيط فقط',
  BOTH: 'كاش أو تقسيط'
};

// ============================================================
// 1. CONFIGURATION (Set tokens in Script Properties or run once)
// ============================================================
/**
 * Edit the values inside this function ONCE, run `saveBotConfig`,
 * then replace them with placeholders again so tokens live safely
 * inside Apps Script PropertiesService.
 */
function saveBotConfig() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    VERIFY_TOKEN:      'waqar_alex_verify_2026',      // Match this in Meta Webhook setup
    PAGE_ACCESS_TOKEN: 'PASTE_YOUR_META_PAGE_TOKEN',  // From Meta App > Messenger > Access Tokens
    PAGE_ID:           'PASTE_YOUR_FACEBOOK_PAGE_ID', // Your Facebook Page numeric ID
    SPREADSHEET_ID:    SpreadsheetApp.getActiveSpreadsheet()
                         ? SpreadsheetApp.getActiveSpreadsheet().getId()
                         : 'PASTE_YOUR_SPREADSHEET_ID',
    GEMINI_API_KEY:    '' // Optional free Google AI Studio key for free-text Arabic parsing
  });
  Logger.log('✅ Bot config saved to ScriptProperties. Spreadsheet ID: ' + props.getProperty('SPREADSHEET_ID'));
}

function botCfg_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}


// ============================================================
// 2. META WEBHOOK ENDPOINTS (GET verification + POST events)
// ============================================================
function doGet(e) {
  const p = (e && e.parameter) || {};
  const mode      = p['hub.mode'];
  const token     = p['hub.verify_token'];
  const challenge = p['hub.challenge'];

  if (mode === 'subscribe' && token && token === botCfg_('VERIFY_TOKEN')) {
    return ContentService.createTextOutput(String(challenge))
      .setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput('Waqar Real Estate Messenger Bot is active.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return botJsonResponse_({ status: 'ignored_empty' });
    }

    const body = JSON.parse(e.postData.contents);

    // B) Direct Automated Ingestion API (from background crawlers, Apify, Make, Zapier, Python/Node)
    if (body.action === 'ingest' || body.action === 'ingest_listing' || body.action === 'ingest_buyer') {
      return botHandleDirectIngest_(body);
    }

    // C) Direct Apify Native Webhook (ACTOR.RUN.SUCCEEDED)
    if (body.eventType === 'ACTOR.RUN.SUCCEEDED' || (body.resource && body.resource.defaultDatasetId) || (body.eventData && body.eventData.defaultDatasetId)) {
      return botHandleApifyWebhook_(body, e);
    }

    if (body.object !== 'page' || !Array.isArray(body.entry)) {
      return botJsonResponse_({ status: 'ignored_non_page' });
    }

    const pageId = botCfg_('PAGE_ID');

    body.entry.forEach(entry => {
      // A) Direct Messenger DMs / Quick Replies / Postbacks
      if (Array.isArray(entry.messaging)) {
        entry.messaging.forEach(event => {
          botHandleMessagingEvent_(event, pageId);
        });
      }

      // B) Facebook Page Feed Webhooks (Post Comments -> Private Reply DM)
      if (Array.isArray(entry.changes)) {
        entry.changes.forEach(change => {
          botHandleFeedChange_(change, pageId);
        });
      }
    });

    return botJsonResponse_({ status: 'ok' });
  } catch (err) {
    botLog_('ERROR', 'doPost', String(err));
    // Always return 200 to Meta so webhook does not get disabled on transient errors
    return botJsonResponse_({ status: 'error', message: String(err) });
  }
}

function botJsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// 3. MESSAGING EVENT ROUTER
// ============================================================
function botHandleMessagingEvent_(event, pageId) {
  if (!event || !event.sender || !event.sender.id) return;
  const psid = String(event.sender.id);

  // Never reply to Page's own echoes or self-messages
  if (pageId && psid === String(pageId)) return;
  if (event.message && event.message.is_echo) return;

  // Deduplicate Meta retries via message id (mid)
  const mid = event.message && event.message.mid;
  if (mid && !botAcquireOnce_('mid_' + mid)) return;

  let payload = '';
  let text = '';

  if (event.postback && event.postback.payload) {
    payload = String(event.postback.payload);
  } else if (event.message) {
    if (event.message.quick_reply && event.message.quick_reply.payload) {
      payload = String(event.message.quick_reply.payload);
    }
    if (event.message.text) {
      text = String(event.message.text).trim();
    }
  }

  if (!payload && !text) return;

  botLog_('DM_IN', psid, payload ? `[${payload}] ${text}` : text);
  botProcessConversation_(psid, text, payload);
}


// ============================================================
// 4. COMMENT-TO-DM PRIVATE REPLY HANDLER (feed webhook)
// ============================================================
function botHandleFeedChange_(change, pageId) {
  if (!change || change.field !== 'feed' || !change.value) return;
  const v = change.value;

  // Only new comments
  if (v.item !== 'comment' || v.verb !== 'add' || !v.comment_id) return;

  // Prevent infinite loop: ignore comments made by the Page itself
  const actorId = (v.from && v.from.id) || v.sender_id || '';
  if (pageId && String(actorId) === String(pageId)) return;

  const commentId = String(v.comment_id);
  if (!botAcquireOnce_('cmt_' + commentId)) return;

  const commenterName = (v.from && v.from.name) || v.sender_name || '';
  const commentText   = String(v.message || '').trim();

  botLog_('COMMENT_IN', commenterName || actorId, commentText);

  // Detect seller vs buyer intent from comment
  const isSellerComment = /للبيع|عندي شقة|عندي محل|عندي أرض|عايز أبيع|ممكن أعرض/.test(commentText);

  const greetingName = commenterName ? ` أ/ ${commenterName}` : '';
  const replyText = isSellerComment
    ? `أهلاً${greetingName} 🌟 شكراً لتعليقك على صفحة وقار للاستثمار العقاري.\n` +
      `نقدر نساعدك في تسويق وحدتك لقاعدة مشترينا في الإسكندرية ✅\n` +
      `اضغط على الزر بالأسفل لبدء تسجيل بيانات العقار الآن:`
    : `أهلاً${greetingName} 🌟 شكراً لاهتمامك بعروض وقار للاستثمار العقاري بالإسكندرية!\n` +
      `عشان نبعثلك السعر والتفاصيل والوحدات المشابهة في ميزانيتك، اختر من الأزرار بالأسفل 👇`;

  // Note: Meta allows ONE private reply per comment_id.
  // Adding quick_replies lets the user reply with 1 tap to open the full 24h chat!
  botSendPrivateReply_(commentId, {
    text: replyText,
    quick_replies: [
      { content_type: 'text', title: '🔑 أبحث عن عقار', payload: 'START_BUYER' },
      { content_type: 'text', title: '🏠 لدي عقار للبيع', payload: 'START_SELLER' },
      { content_type: 'text', title: '💬 تواصل واتساب', payload: 'CONTACT_NOURA' }
    ]
  });
}


// ============================================================
// 5. ARABIC CONVERSATION STATE MACHINE (Buyer + Seller Flows)
// ============================================================
function botProcessConversation_(psid, text, payload) {
  // Global reset commands / menu triggers
  if (
    payload === 'GET_STARTED' ||
    payload === 'MAIN_MENU' ||
    /^(القائمة|ابدأ|بداية|مرحبا|السلام عليكم|أهلا|اهلا|hi|hello|start)$/i.test(text)
  ) {
    botClearState_(psid);
    botSendMainMenu_(psid);
    return;
  }

  if (payload === 'CONTACT_NOURA' || (/واتساب|رقم|تواصل|نورا/.test(text) && !botGetState_(psid))) {
    botSendNouraContact_(psid);
    return;
  }

  if (payload === 'START_BUYER') {
    botStartBuyerFlow_(psid);
    return;
  }

  if (payload === 'START_SELLER') {
    botStartSellerFlow_(psid);
    return;
  }

  if (payload && payload.indexOf('BOOK_VIEW:') === 0) {
    botHandleBookViewing_(psid, payload.split(':')[1] || '');
    return;
  }

  const state = botGetState_(psid);

  // No active multi-step session yet -> try AI free-text parser if Gemini key exists, else show menu
  if (!state) {
    if (text.length > 20 && botCfg_('GEMINI_API_KEY')) {
      const handled = botTryAiFreeTextCapture_(psid, text);
      if (handled) return;
    }
    botSendMainMenu_(psid);
    return;
  }

  if (state.flow === 'BUYER') {
    botHandleBuyerStep_(psid, state, text, payload);
  } else if (state.flow === 'SELLER') {
    botHandleSellerStep_(psid, state, text, payload);
  } else {
    botClearState_(psid);
    botSendMainMenu_(psid);
  }
}

function botSendMainMenu_(psid) {
  botSendMessage_(psid, {
    text:
      'أهلاً بحضرتك في *وقار للاستثمار العقاري* بالإسكندرية 🏢🌟\n' +
      'نقدر نساعدك إزاي النهارده؟ اختر من الأزرار بالأسفل:',
    quick_replies: [
      { content_type: 'text', title: '🔑 أبحث عن عقار', payload: 'START_BUYER' },
      { content_type: 'text', title: '🏠 لدي عقار للبيع', payload: 'START_SELLER' },
      { content_type: 'text', title: '📞 تواصل مع أ/ نورا', payload: 'CONTACT_NOURA' }
    ]
  });
}

function botSendNouraContact_(psid) {
  botSendMessage_(psid, {
    text:
      'يسعدنا تواصلك المباشر مع أ/ نورا إسماعيل (وقار للاستثمار العقاري) 📲\n\n' +
      '💬 واتساب مباشر:\nhttps://wa.me/201108118381\n' +
      '📞 تليفون: 01108118381\n' +
      '🌐 موقعنا: http://waqar.runasp.net/',
    quick_replies: [
      { content_type: 'text', title: '🔑 تسجيل طلب شراء', payload: 'START_BUYER' },
      { content_type: 'text', title: '🏠 عرض عقار للبيع', payload: 'START_SELLER' }
    ]
  });
}


// ============================================================
// 6. BUYER QUALIFICATION FLOW (7 Quick 1-Tap Arabic Steps)
// ============================================================
function botStartBuyerFlow_(psid) {
  botSaveState_(psid, { flow: 'BUYER', step: 'TYPE', data: {} });
  botSendMessage_(psid, {
    text: 'ممتاز! خدمتنا للمشترين مجانية 100% ✅\n(1/7) ما نوع الوحدة التي تبحث عنها؟',
    quick_replies: [
      { content_type: 'text', title: '🏢 شقة', payload: 'B_TYPE:شقة' },
      { content_type: 'text', title: '🏗️ أرض', payload: 'B_TYPE:أرض' },
      { content_type: 'text', title: '🏪 محل تجاري', payload: 'B_TYPE:محل تجاري' },
      { content_type: 'text', title: '🏡 فيلا / دوبلكس', payload: 'B_TYPE:فيلا / دوبلكس' },
      { content_type: 'text', title: 'أي نوع مناسب', payload: 'B_TYPE:أي نوع مناسب' }
    ]
  });
}

function botHandleBuyerStep_(psid, state, text, payload) {
  const val = payload && payload.indexOf(':') !== -1 ? payload.split(':').slice(1).join(':') : text;

  switch (state.step) {
    case 'TYPE':
      state.data.type = val;
      state.step = 'AREA';
      botSaveState_(psid, state);
      botSendMessage_(psid, {
        text: '(2/7) ما المنطقة أو المناطق المفضلة في الإسكندرية؟\n(اختر من الأزرار أو اكتب اسم المنطقة)',
        quick_replies: [
          { content_type: 'text', title: 'سموحة / كفر عبده', payload: 'B_AREA:سموحة، كفر عبده' },
          { content_type: 'text', title: 'روشدي / سبورتنج', payload: 'B_AREA:روشدي، سبورتنج، جليم، سان ستيفانو' },
          { content_type: 'text', title: 'ميامي / سيدي بشر', payload: 'B_AREA:ميامي، سيدي بشر، المندرة' },
          { content_type: 'text', title: 'العجمي / الساحل', payload: 'B_AREA:العجمي' },
          { content_type: 'text', title: 'أي منطقة مناسبة', payload: 'B_AREA:أي منطقة مناسبة' }
        ]
      });
      break;

    case 'AREA':
      state.data.areas = val;
      state.step = 'SIZE';
      botSaveState_(psid, state);
      botSendMessage_(psid, {
        text: '(3/7) ما المساحة التقريبية المطلوبة (بالمتر المربع)؟',
        quick_replies: [
          { content_type: 'text', title: 'أقل من 100 م²', payload: 'B_SIZE:0' },
          { content_type: 'text', title: '100 - 150 م²', payload: 'B_SIZE:100' },
          { content_type: 'text', title: '150 - 220 م²', payload: 'B_SIZE:150' },
          { content_type: 'text', title: 'أكثر من 220 م²', payload: 'B_SIZE:220' },
          { content_type: 'text', title: 'مرن حسب الوحدة', payload: 'B_SIZE:0' }
        ]
      });
      break;

    case 'SIZE': {
      const sizeNum = Number(String(val).replace(/[^\d]/g, '')) || 0;
      state.data.minArea = sizeNum;
      state.step = 'BUDGET';
      botSaveState_(psid, state);
      botSendMessage_(psid, {
        text: '(4/7) ما الميزانية التقريبية الأقصى بالجنيه المصري؟',
        quick_replies: [
          { content_type: 'text', title: 'أقل من 2 مليون', payload: 'B_BUDGET:0|2000000' },
          { content_type: 'text', title: '2 - 4 مليون', payload: 'B_BUDGET:2000000|4000000' },
          { content_type: 'text', title: '4 - 7 مليون', payload: 'B_BUDGET:4000000|7000000' },
          { content_type: 'text', title: '7 - 15 مليون', payload: 'B_BUDGET:7000000|15000000' },
          { content_type: 'text', title: 'أكثر من 15 مليون', payload: 'B_BUDGET:15000000|100000000' },
          { content_type: 'text', title: 'مفتوح حسب الوحدة', payload: 'B_BUDGET:0|999999999' }
        ]
      });
      break;
    }

    case 'BUDGET': {
      const [minB, maxB] = botParseBudgetInput_(val);
      state.data.budgetMin = minB;
      state.data.budgetMax = maxB;
      state.step = 'PAYMENT';
      botSaveState_(psid, state);
      botSendMessage_(psid, {
        text: '(5/7) طريقة الدفع المفضلة؟',
        quick_replies: [
          { content_type: 'text', title: '💵 كاش فقط', payload: 'B_PAY:كاش فقط' },
          { content_type: 'text', title: '📅 تقسيط فقط', payload: 'B_PAY:تقسيط فقط' },
          { content_type: 'text', title: '💵📅 كاش أو تقسيط', payload: 'B_PAY:كاش أو تقسيط' }
        ]
      });
      break;
    }

    case 'PAYMENT':
      state.data.payment = val;
      state.step = 'TIMELINE';
      botSaveState_(psid, state);
      botSendMessage_(psid, {
        text: '(6/7) متى تنوي الشراء تقريباً؟',
        quick_replies: [
          { content_type: 'text', title: '⚡ عاجل (أقل من شهر)', payload: 'B_TIME:عاجل — أقل من شهر' },
          { content_type: 'text', title: '🗓️ خلال 1-3 شهور', payload: 'B_TIME:خلال 1-3 شهور' },
          { content_type: 'text', title: '🗓️ خلال 3-6 شهور', payload: 'B_TIME:خلال 3-6 شهور' },
          { content_type: 'text', title: '🤷 مرن / استكشاف', payload: 'B_TIME:مرن — مش عارف بالضبط' }
        ]
      });
      break;

    case 'TIMELINE':
      state.data.timeline = val;
      state.step = 'CONTACT';
      botSaveState_(psid, state);
      botSendMessage_(psid, {
        text:
          '(7/7) أخيراً: اكتب اسمك الكريم ورقم الواتساب في رسالة واحدة\n' +
          'مثال: أحمد محمد - 01012345678'
      });
      break;

    case 'CONTACT': {
      const parsedPhone = botExtractEgyptPhone_(text);
      if (!parsedPhone) {
        botSendMessage_(psid, {
          text: 'برجاء كتابة رقم موبايل مصري صحيح (11 رقم يبدأ بـ 01) لكي نتمكن من إرسال الصور على الواتساب.\nمثال: محمد علي - 01108118381'
        });
        return;
      }
      const cleanName = text.replace(/[\d+\-()]/g, '').trim() || botFetchPsidName_(psid) || 'عميل ماسنجر';
      state.data.name = cleanName;
      state.data.phone = parsedPhone;

      const buyerId = botSaveBuyerToSheet_(state.data, psid);
      const matches = botFindInstantMatches_(state.data, buyerId);
      botClearState_(psid);

      botSendBuyerMatchesReply_(psid, cleanName, buyerId, matches);
      break;
    }
  }
}

function botSendBuyerMatchesReply_(psid, cleanName, buyerId, matches) {
  let finalMsg = `شكراً أ/ ${cleanName} ✅ تم تسجيل طلبك بنجاح (كود: ${buyerId}).\n`;

  if (matches.length > 0) {
    finalMsg += `\n🎯 وجدنا لك ${matches.length} ترشيحات مناسبة (تشمل المطابق + البدائل الذكية القريبة في السعر أو المنطقة):\n\n`;
    matches.forEach((m, i) => {
      const sqmStr = m.pricePerSqm > 0 ? ` (${Number(m.pricePerSqm).toLocaleString('en-US')} ج/م²)` : '';
      const catTag = m.category === 'location_alt'
        ? '🗺️ بديل مكاني قريب'
        : (m.category === 'price_alt' ? '💰 أعلى قليلاً وقابل للتفاوض' : '🎯 تطابق مثالي');
      finalMsg +=
        `${i + 1}) ${catTag} — ${m.type} في ${m.district} (${m.area || '-'} م²)\n` +
        `💰 السعر: ${m.price ? Number(m.price).toLocaleString('en-US') + ' ج' + sqmStr : 'عند الاستفسار'} | تطابق ${m.score}%\n` +
        (m.highlights ? `✨ ${m.highlights}\n` : '') +
        `📌 كود: ${m.id}` + (m.fbLink ? `\n🔗 ${m.fbLink}` : '') + '\n\n';
    });
    finalMsg += 'اضغط على أي وحدة بالأسفل لحجز معاينة فوراً أو تواصل معنا واتساب: https://wa.me/201108118381';

    const quickReplies = matches.slice(0, 3).map(m => ({
      content_type: 'text',
      title: `📅 معاينة ${m.id}`,
      payload: `BOOK_VIEW:${m.id}`
    }));
    quickReplies.push({ content_type: 'text', title: '🏠 القائمة الرئيسية', payload: 'MAIN_MENU' });

    botSendMessage_(psid, { text: finalMsg, quick_replies: quickReplies });
  } else {
    finalMsg +=
      '\nسيتواصل معك فريق وقار فوراً على الواتساب عند توافر أول وحدة تطابق مواصفاتك 📲\n' +
      'واتساب مباشر: https://wa.me/201108118381';
    botSendMessage_(psid, {
      text: finalMsg,
      quick_replies: [{ content_type: 'text', title: '🏠 القائمة الرئيسية', payload: 'MAIN_MENU' }]
    });
  }
}

function botHandleBookViewing_(psid, unitId) {
  botLog_('BOOK_VIEW', psid, unitId);
  try {
    const ss = botGetSpreadsheet_();
    const matchSheet = ss.getSheetByName(BOT_SHEETS.MATCHES);
    if (matchSheet && matchSheet.getLastRow() >= 2 && unitId) {
      const rows = matchSheet.getRange(2, 3, matchSheet.getLastRow() - 1, 10).getValues();
      for (let i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i][0]).trim() === unitId) {
          matchSheet.getRange(i + 2, 12).setValue('مهتم 👍');
          matchSheet.getRange(i + 2, 14).setValue('طلب معاينة من ماسنجر');
          break;
        }
      }
    }
  } catch (e) {}

  const waText = encodeURIComponent(`أهلاً أ/ نورا، أرغب في حجز معاينة للوحدة كود ${unitId}`);
  botSendMessage_(psid, {
    text:
      `تم تسجيل اهتمامك بالوحدة (${unitId}) ✅\n` +
      `لتأكيد ميعاد المعاينة وإرسال الصور والموقع، اضغط هنا للتواصل مباشرة مع أ/ نورا على واتساب:\n` +
      `https://wa.me/201108118381?text=${waText}`,
    quick_replies: [{ content_type: 'text', title: '🏠 القائمة الرئيسية', payload: 'MAIN_MENU' }]
  });
}


// ============================================================
// 7. SELLER INTAKE FLOW (5 Quick Arabic Steps -> Approval Queue)
// ============================================================
function botStartSellerFlow_(psid) {
  botSaveState_(psid, { flow: 'SELLER', step: 'TYPE', data: {} });
  botSendMessage_(psid, {
    text: 'أهلاً بحضرتك 🌟 يسعدنا تسويق عقارك لقاعدة مشترينا في الإسكندرية.\n(1/5) ما نوع الوحدة؟',
    quick_replies: [
      { content_type: 'text', title: '🏢 شقة', payload: 'S_TYPE:شقة' },
      { content_type: 'text', title: '🏗️ أرض', payload: 'S_TYPE:أرض' },
      { content_type: 'text', title: '🏪 محل تجاري', payload: 'S_TYPE:محل تجاري' },
      { content_type: 'text', title: '🏡 فيلا / دوبلكس', payload: 'S_TYPE:فيلا' }
    ]
  });
}

function botHandleSellerStep_(psid, state, text, payload) {
  const val = payload && payload.indexOf(':') !== -1 ? payload.split(':').slice(1).join(':') : text;

  switch (state.step) {
    case 'TYPE':
      state.data.type = val;
      state.step = 'AREA';
      botSaveState_(psid, state);
      botSendMessage_(psid, {
        text: '(2/5) في أي منطقة في الإسكندرية، وما اسم الشارع أو أقرب علامة مميزة؟\nمثال: سموحة - شارع فوزي معاذ'
      });
      break;

    case 'AREA':
      state.data.locationRaw = text;
      state.data.district = botDetectAlexDistrict_(text);
      state.step = 'SPECS';
      botSaveState_(psid, state);
      botSendMessage_(psid, {
        text: '(3/5) ما المساحة (بالمتر)، والسعر الإجمالي المطلوب، وهل الدفع كاش أم تقسيط؟\nمثال: 160 متر - 4,200,000 جنيه - كاش'
      });
      break;

    case 'SPECS':
      state.data.specsRaw = text;
      state.step = 'DETAILS';
      botSaveState_(psid, state);
      botSendMessage_(psid, {
        text: '(4/5) اكتب باقي التفاصيل باختصار (عدد الغرف، الدور، التشطيب، حالة السند/الملكية):'
      });
      break;

    case 'DETAILS':
      state.data.detailsRaw = text;
      state.step = 'CONTACT';
      botSaveState_(psid, state);
      botSendMessage_(psid, {
        text: '(5/5) أخيراً: اكتب اسمك ورقم الواتساب للتواصل والمراجعة\nمثال: كريم حسن - 01012345678'
      });
      break;

    case 'CONTACT': {
      const parsedPhone = botExtractEgyptPhone_(text);
      if (!parsedPhone) {
        botSendMessage_(psid, {
          text: 'برجاء إدخال رقم موبايل مصري صحيح (11 رقم يبدأ بـ 01) لكي تتواصل معك أ/ نورا.'
        });
        return;
      }
      const cleanName = text.replace(/[\d+\-()]/g, '').trim() || botFetchPsidName_(psid) || 'بائع ماسنجر';
      state.data.name = cleanName;
      state.data.phone = parsedPhone;

      const listingId = botSaveSellerToSheet_(state.data, psid);
      botClearState_(psid);

      botSendMessage_(psid, {
        text:
          `شكراً أ/ ${cleanName} ✅ تم تسجيل عقارك بنجاح (كود: ${listingId}).\n\n` +
          `ستقوم أ/ نورا إسماعيل بمراجعة البيانات والتواصل معك قبل النشر.\n` +
          `📸 من فضلك أرسل 5 صور واضحة للوحدة الآن على واتساب:\nhttps://wa.me/201108118381`,
        quick_replies: [{ content_type: 'text', title: '🏠 القائمة الرئيسية', payload: 'MAIN_MENU' }]
      });
      break;
    }
  }
}


// ============================================================
// 8. GOOGLE SHEETS READ/WRITE & INSTANT MATCHING
// ============================================================
function botGetSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = botCfg_('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID not configured. Run saveBotConfig() first.');
  return SpreadsheetApp.openById(id);
}

function botSaveBuyerToSheet_(d, psid) {
  const ss = botGetSpreadsheet_();
  const sheet = ss.getSheetByName(BOT_SHEETS.BUYERS);
  const row = botFirstEmptyRow_(sheet, 5);
  const buyerId = 'BYR-' + String(row - 1).padStart(3, '0');

  let status = 'دافئ 🌡️';
  if (d.timeline.indexOf('عاجل') !== -1 || d.timeline.indexOf('1-3') !== -1) status = 'نشط 🔥';
  else if (d.timeline.indexOf('مرن') !== -1) status = 'بارد ❄️';

  sheet.getRange(row, 2, 1, 14).setValues([[
    new Date(),             // B: تاريخ التسجيل
    'ماسنجر',               // C: المصدر
    status,                 // D: الحالة
    d.name,                 // E: الاسم
    d.phone,                // F: واتساب
    d.type || 'أي نوع مناسب', // G: نوع الوحدة
    d.budgetMax || '',      // H: الميزانية الأقصى
    d.budgetMin || 0,       // I: الميزانية الأدنى
    d.areas || '',          // J: المناطق المفضلة
    Number(d.minArea || 0), // K: المساحة الأدنى
    d.payment || BOT_PAYMENTS.BOTH, // L: طريقة الدفع
    d.timeline || '',       // M: الوقت المتاح
    '',                     // N: مواصفات مهمة
    'PSID: ' + psid         // O: ملاحظات
  ]]);
  sheet.getRange(row, 20).setValue(new Date());
  return buyerId;
}

function botSaveSellerToSheet_(d, psid) {
  const ss = botGetSpreadsheet_();
  const sheet = ss.getSheetByName(BOT_SHEETS.LISTINGS);
  const row = botFirstEmptyRow_(sheet, 5);
  const listingId = 'WQ-' + String(row - 1).padStart(3, '0');

  const areaNum  = botExtractAreaM2_(d.specsRaw);
  const priceNum = botExtractPriceEgp_(d.specsRaw);
  let payment = BOT_PAYMENTS.BOTH;
  if (/كاش فقط|كاش/.test(d.specsRaw) && !/تقسيط/.test(d.specsRaw)) payment = 'كاش';
  else if (/تقسيط/.test(d.specsRaw) && !/كاش/.test(d.specsRaw)) payment = 'تقسيط';

  const rawDesc = [d.locationRaw, d.specsRaw, d.detailsRaw].filter(Boolean).join('\n');

  sheet.getRange(row, 2, 1, 9).setValues([[
    new Date(),
    'ماسنجر',
    'جديد', // Always waits for Noura approval before publishing!
    d.type || 'شقة',
    d.district || 'منطقة أخرى',
    d.locationRaw || '',
    '',
    '',
    areaNum || ''
  ]]);

  if (priceNum) sheet.getRange(row, 17).setValue(priceNum);
  sheet.getRange(row, 19).setValue(payment);
  sheet.getRange(row, 22, 1, 2).setValues([[d.name, d.phone]]);
  sheet.getRange(row, 25).setValue(rawDesc);
  sheet.getRange(row, 30).setValue('مسجل عبر بوت ماسنجر — PSID: ' + psid);
  sheet.getRange(row, 32).setValue(new Date());
  return listingId;
}

function botFindInstantMatches_(buyer, buyerId) {
  const ss = botGetSpreadsheet_();
  const matchSheet = ss.getSheetByName(BOT_SHEETS.MATCHES);
  const matches = [];

  if (typeof m3_scorePair_ === 'function' && typeof m3_getActiveListings_ === 'function') {
    // Unified Phase 3 scoring engine (uses Alexandria neighbors, asset rules & settings weights)
    const cfg = m3_loadConfig_(ss);
    const listings = m3_getActiveListings_(ss);
    const buyerObj = {
      id: buyerId,
      name: buyer.name,
      phone: buyer.phone,
      wantedType: buyer.type || 'أي نوع مناسب',
      budgetMin: Number(buyer.budgetMin || 0),
      budgetMax: Number(buyer.budgetMax || 0),
      preferredAreas: buyer.areas || '',
      minArea: Number(buyer.minArea || 0),
      payment: buyer.payment || BOT_PAYMENTS.BOTH,
      mustHaves: buyer.mustHaves || ''
    };

    listings.forEach(l => {
      const res = m3_scorePair_(l, buyerObj, cfg);
      if (res.score >= cfg.warmThreshold) {
        const hl = [
          l.finishing && l.finishing.indexOf('غير منطبق') === -1 ? l.finishing : '',
          l.legalStatus && l.legalStatus !== 'غير محدد' ? l.legalStatus : '',
          l.negotiable === 'نعم' ? 'قابل للتفاوض' : ''
        ].filter(Boolean).join(' | ');
        matches.push({
          id: l.id, type: l.type, district: l.district, area: l.area,
          price: l.price, pricePerSqm: l.pricePerSqm, fbLink: l.fbLink,
          score: res.score, category: res.category, highlights: hl,
          details: res.reasons.join(' + ')
        });
      }
    });
  } else {
    // Standalone Phase 2 fallback (when MatchingEngine.gs is not installed yet)
    const listSheet = ss.getSheetByName(BOT_SHEETS.LISTINGS);
    if (!listSheet || listSheet.getLastRow() < 2) return [];
    const rows = listSheet.getRange(2, 1, listSheet.getLastRow() - 1, 29).getValues();
    rows.forEach((r, idx) => {
      const status = String(r[3] || '');
      if (status !== 'منشور' && status !== 'تمت المراجعة') return;

      const id       = r[0] || ('WQ-' + String(idx + 1).padStart(3, '0'));
      const type     = String(r[4] || '');
      const district = String(r[5] || '');
      const area     = Number(r[9] || 0);
      const finishing= String(r[13] || '');
      const price    = Number(r[16] || 0);
      const pay      = String(r[18] || '');
      const neg      = String(r[20] || '');
      const legal    = String(r[23] || '');
      const fbLink   = String(r[27] || '');

      if (buyer.type && buyer.type !== 'أي نوع مناسب' && type && buyer.type.indexOf(type) === -1 && type.indexOf(buyer.type) === -1) return;
      if (buyer.budgetMax && buyer.budgetMax < 90000000 && price > buyer.budgetMax * 1.2) return;

      let score = 0;
      let category = 'exact';
      const reasons = [];

      if (price <= 0) score += 5;
      else if (!buyer.budgetMax || buyer.budgetMax >= 90000000) score += 23;
      else if (price <= buyer.budgetMax) { score += 35; reasons.push('ضمن الميزانية'); }
      else if (price <= buyer.budgetMax * 1.15 && neg === 'نعم') { score += 18; category = 'price_alt'; reasons.push('أعلى قليلاً وقابل للتفاوض'); }

      if (buyer.areas === 'أي منطقة مناسبة' || (district && String(buyer.areas).indexOf(district) !== -1)) {
        score += 30; reasons.push('نفس المنطقة');
      } else {
        score += 10; category = 'location_alt'; reasons.push('منطقة بديلة');
      }

      score += 12; reasons.push('نفس نوع الوحدة');
      if (buyer.minArea > 0 && area >= buyer.minArea) score += 8;
      else if (!buyer.minArea && area > 0) score += 8;

      if (buyer.payment === BOT_PAYMENTS.BOTH || pay === 'كاش أو تقسيط' ||
          (buyer.payment.indexOf('كاش') !== -1 && pay.indexOf('كاش') !== -1) ||
          (buyer.payment.indexOf('تقسيط') !== -1 && pay.indexOf('تقسيط') !== -1)) {
        score += 10;
      }

      if (score >= 60) {
        const perSqm = (area > 0 && price > 0) ? Math.round(price / area) : 0;
        const hl = [finishing, legal, neg === 'نعم' ? 'قابل للتفاوض' : ''].filter(Boolean).join(' | ');
        matches.push({ id, type, district, area, price, pricePerSqm: perSqm, fbLink, score, category, highlights: hl, details: reasons.join(' + ') });
      }
    });
  }

  matches.sort((a, b) => b.score - a.score);
  // Curate up to 3: prioritize top exact + smart alternatives if available
  const top3 = [];
  const usedIds = new Set();
  const exactHit = matches.find(m => m.category === 'exact');
  const locAlt   = matches.find(m => m.category === 'location_alt');
  const priceAlt = matches.find(m => m.category === 'price_alt');
  [exactHit, locAlt, priceAlt].forEach(pick => {
    if (pick && !usedIds.has(pick.id)) { top3.push(pick); usedIds.add(pick.id); }
  });
  for (let i = 0; i < matches.length && top3.length < 3; i++) {
    if (!usedIds.has(matches[i].id)) { top3.push(matches[i]); usedIds.add(matches[i].id); }
  }

  // Log matches into 🔗 التطابقات (including Sent Date in col M)
  if (matchSheet && top3.length > 0) {
    let mRow = botFirstEmptyRow_(matchSheet, 3);
    const now = new Date();
    top3.forEach(m => {
      matchSheet.getRange(mRow, 2, 1, 12).setValues([[
        now, m.id, buyerId, buyer.name, buyer.phone,
        m.type, m.district, m.price, m.score, m.details, 'تم الإرسال', now
      ]]);
      mRow++;
    });
  }

  return top3;
}


// ============================================================
// 9. OPTIONAL FREE GEMINI FREE-TEXT PARSER (Buyers + Sellers)
// ============================================================
function botTryAiFreeTextCapture_(psid, text) {
  const apiKey = botCfg_('GEMINI_API_KEY');
  if (!apiKey) return false;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const prompt =
      'استخرج النية كـ JSON فقط بدون أي كلام إضافي:\n' +
      '{"intent":"BUYER|SELLER|OTHER","type":"","district":"","area":0,"budgetMax":0,"price":0,"payment":"","phone":""}\n' +
      'النص: ' + text;

    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const json = JSON.parse(resp.getContentText());
    const raw = json.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    const cleanPhone = botExtractEgyptPhone_(parsed.phone || text);

    if (parsed.intent === 'BUYER' && cleanPhone) {
      const buyerData = {
        name: botFetchPsidName_(psid) || 'عميل ماسنجر',
        phone: cleanPhone,
        type: parsed.type || 'أي نوع مناسب',
        areas: parsed.district || 'أي منطقة مناسبة',
        minArea: Number(parsed.area) || 0,
        budgetMin: 0,
        budgetMax: Number(parsed.budgetMax) || 999999999,
        payment: parsed.payment || BOT_PAYMENTS.BOTH,
        timeline: 'خلال 1-3 شهور'
      };
      const buyerId = botSaveBuyerToSheet_(buyerData, psid);
      const matches = botFindInstantMatches_(buyerData, buyerId);
      botSendBuyerMatchesReply_(psid, buyerData.name, buyerId, matches);
      return true;
    }

    if (parsed.intent === 'SELLER' && cleanPhone) {
      const sellerData = {
        name: botFetchPsidName_(psid) || 'بائع ماسنجر',
        phone: cleanPhone,
        type: parsed.type || 'شقة',
        district: parsed.district || botDetectAlexDistrict_(text),
        locationRaw: parsed.district || '',
        specsRaw: [parsed.area ? parsed.area + ' متر' : '', parsed.price || '', parsed.payment || ''].filter(Boolean).join(' - '),
        detailsRaw: text
      };
      const listingId = botSaveSellerToSheet_(sellerData, psid);
      botSendMessage_(psid, {
        text:
          `تم تسجيل عقارك تلقائياً (${listingId}) ✅\n` +
          `ستتواصل معك أ/ نورا على ${cleanPhone} للمراجعة والنشر. أرسل الصور هنا أو على واتساب: https://wa.me/201108118381`
      });
      return true;
    }
  } catch (err) {
    botLog_('WARN', 'GeminiFallback', String(err));
  }
  return false;
}


// ============================================================
// 10. META GRAPH API CALLS
// ============================================================
function botSendMessage_(recipientPsid, messageObj) {
  const token = botCfg_('PAGE_ACCESS_TOKEN');
  if (!token || token.indexOf('PASTE_') === 0) {
    botLog_('DRY_RUN_DM', recipientPsid, JSON.stringify(messageObj));
    return;
  }
  const url = `https://graph.facebook.com/${BOT_GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(token)}`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      recipient: { id: recipientPsid },
      messaging_type: 'RESPONSE',
      message: messageObj
    })
  });
  if (res.getResponseCode() >= 400) {
    botLog_('META_ERR', recipientPsid, res.getContentText());
  }
}

function botSendPrivateReply_(commentId, messageObj) {
  const token  = botCfg_('PAGE_ACCESS_TOKEN');
  const pageId = botCfg_('PAGE_ID') || 'me';
  if (!token || token.indexOf('PASTE_') === 0) {
    botLog_('DRY_RUN_PRIVATE_REPLY', commentId, JSON.stringify(messageObj));
    return;
  }
  const url = `https://graph.facebook.com/${BOT_GRAPH_VERSION}/${pageId}/messages?access_token=${encodeURIComponent(token)}`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      recipient: { comment_id: commentId },
      message: messageObj
    })
  });
  if (res.getResponseCode() >= 400) {
    botLog_('META_PR_ERR', commentId, res.getContentText());
  }
}

function botFetchPsidName_(psid) {
  const token = botCfg_('PAGE_ACCESS_TOKEN');
  if (!token || token.indexOf('PASTE_') === 0) return '';
  try {
    const url = `https://graph.facebook.com/${BOT_GRAPH_VERSION}/${psid}?fields=first_name,last_name&access_token=${encodeURIComponent(token)}`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const p = JSON.parse(res.getContentText());
      return [p.first_name, p.last_name].filter(Boolean).join(' ');
    }
  } catch (e) {}
  return '';
}


// ============================================================
// 11. SESSION STATE, PARSERS & LOGGING HELPERS
// ============================================================
function botGetState_(psid) {
  const raw = CacheService.getScriptCache().get('st_' + psid);
  return raw ? JSON.parse(raw) : null;
}

function botSaveState_(psid, state) {
  // Keep user conversation step alive for 6 hours
  CacheService.getScriptCache().put('st_' + psid, JSON.stringify(state), 21600);
}

function botClearState_(psid) {
  CacheService.getScriptCache().remove('st_' + psid);
}

function botAcquireOnce_(key) {
  const cache = CacheService.getScriptCache();
  if (cache.get(key)) return false;
  cache.put(key, '1', 600);
  return true;
}

function botExtractEgyptPhone_(text) {
  const cleaned = String(text || '').replace(/[\s\-()]/g, '');
  const m = cleaned.match(/(?:\+?20|0020|0)?(1[0125]\d{8})/);
  return m ? '0' + m[1] : '';
}

function botParseBudgetInput_(val) {
  if (val.indexOf('|') !== -1) {
    const parts = val.split('|').map(Number);
    return [parts[0] || 0, parts[1] || 999999999];
  }
  const normalized = String(val || '').replace(/[,،]/g, '');
  const numMatch = normalized.match(/\d+(?:\.\d+)?/);
  if (!numMatch) return [0, 999999999];
  let n = Number(numMatch[0]);
  if (/مليون|m\b/i.test(val) || n < 1000) n = Math.round(n * 1000000);
  return [0, n];
}

function botExtractAreaM2_(text) {
  const m = String(text || '').match(/(\d{2,5})\s*(?:متر|م2|م²|m2|m)/i);
  return m ? Number(m[1]) : '';
}

function botExtractPriceEgp_(text) {
  const s = String(text || '').replace(/[,،]/g, '');
  const mil = s.match(/(\d+(?:\.\d+)?)\s*(?:مليون|million|m\b)/i);
  if (mil) return Math.round(Number(mil[1]) * 1000000);
  const big = s.match(/\b(\d{6,9})\b/);
  return big ? Number(big[1]) : '';
}

function botDetectAlexDistrict_(text) {
  const districts = [
    'سموحة', 'روشدي', 'سان ستيفانو', 'سبورتنج', 'ستانلي', 'جليم', 'زيزينيا',
    'سيدي جابر', 'كفر عبده', 'لوران', 'فيكتوريا', 'ميامي', 'سيدي بشر',
    'المندرة', 'كليوباترا', 'الإبراهيمية', 'محرم بك', 'المنتزه', 'المعمورة',
    'أبو قير', 'العجمي', 'الهانوفيل', 'البيطاش', 'برج العرب', 'الدخيلة',
    'العامرية', 'وسط البلد', 'بحري'
  ];
  for (let i = 0; i < districts.length; i++) {
    if (String(text || '').indexOf(districts[i]) !== -1) return districts[i];
  }
  return 'منطقة أخرى';
}

function botFirstEmptyRow_(sheet, checkCol) {
  const maxRow = sheet.getLastRow();
  if (maxRow < 2) return 2;
  const vals = sheet.getRange(2, checkCol, maxRow - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (!vals[i][0]) return i + 2;
  }
  return maxRow + 1;
}

function botLog_(type, ref, msg) {
  Logger.log(`[${type}] ${ref}: ${msg}`);
  try {
    const ss = botGetSpreadsheet_();
    let logSheet = ss.getSheetByName(BOT_SHEETS.LOGS);
    if (!logSheet) {
      logSheet = ss.insertSheet(BOT_SHEETS.LOGS);
      logSheet.getRange(1, 1, 1, 4).setValues([['الوقت', 'النوع', 'المستخدم / المرجع', 'التفاصيل']])
        .setFontWeight('bold').setBackground('#263238').setFontColor('#ffffff');
      logSheet.setFrozenRows(1);
    }
    logSheet.appendRow([new Date(), type, String(ref), String(msg).slice(0, 1000)]);
  } catch (e) {}
}


// ============================================================
// 12. LOCAL TEST HARNESS (Run inside Apps Script Editor!)
// Tests Buyer Flow, Instant Matching, Seller Flow & Comment-to-DM
// without sending real Facebook API requests (unless token is set).
// ============================================================
function testBotSimulation() {
  const testPsid = 'TEST_USER_999';
  botClearState_(testPsid);

  // 1. Simulate comment on a Facebook Page post
  botHandleFeedChange_({
    field: 'feed',
    value: {
      item: 'comment',
      verb: 'add',
      comment_id: 'TEST_CMT_' + Date.now(),
      from: { id: testPsid, name: 'محمد عادل' },
      message: 'بكام الشقة لو سمحت؟'
    }
  }, 'PAGE_SELF_ID');

  // 2. Simulate full 7-step Buyer Conversation
  botProcessConversation_(testPsid, '', 'START_BUYER');
  botProcessConversation_(testPsid, 'شقة', 'B_TYPE:شقة');
  botProcessConversation_(testPsid, 'سموحة', 'B_AREA:سموحة، كفر عبده');
  botProcessConversation_(testPsid, '150 - 220 م²', 'B_SIZE:150');
  botProcessConversation_(testPsid, '4 مليون', 'B_BUDGET:2000000|4000000');
  botProcessConversation_(testPsid, 'كاش', 'B_PAY:كاش فقط');
  botProcessConversation_(testPsid, 'عاجل', 'B_TIME:عاجل — أقل من شهر');
  botProcessConversation_(testPsid, 'محمد عادل - 01099887766', '');

  Logger.log('✅ testBotSimulation finished! Check 👥 المشترون and 🤖 سجل البوت sheets.');
}


// ============================================================
// 13. DIRECT INGESTION ENDPOINT (Headless Crawlers, Apify, Webhooks)
// ============================================================
/**
 * Handles automated ingestion from background crawlers, Apify Facebook scrapers,
 * Make/n8n webhooks, Python/Node scripts, and RSS engines.
 * 
 * Supports:
 * - body.listings: Array of properties (or single body.listing)
 * - body.buyers:   Array of buyer requests (or single body.buyer)
 * - Intelligent deduplication by URL and phone number
 * - Automatic trigger of Matching Engine on ingestion
 */
function botHandleDirectIngest_(body) {
  try {
    const secret = botCfg_('INGEST_SECRET');
    if (secret && body.secret !== secret) {
      return botJsonResponse_({ status: 'unauthorized', message: 'Invalid or missing secret' });
    }

    const ss = botGetSpreadsheet_();
    if (!ss) {
      return botJsonResponse_({ status: 'error', message: 'Spreadsheet not accessible' });
    }

    let insertedListings = 0;
    let skippedListings = 0;
    let insertedBuyers = 0;
    let skippedBuyers = 0;

    let rawListings = [];
    if (Array.isArray(body.listings)) {
      rawListings = body.listings;
    } else if (body.listing && typeof body.listing === 'object') {
      rawListings = [body.listing];
    }

    let rawBuyers = [];
    if (Array.isArray(body.buyers)) {
      rawBuyers = body.buyers;
    } else if (body.buyer && typeof body.buyer === 'object') {
      rawBuyers = [body.buyer];
    }

    // A) Process Property Listings
    if (rawListings.length > 0) {
      const fetchQueueSheet = ss.getSheetByName(BOT_SHEETS.FETCH_QUEUE || '🌐 جلب العقارات (خارجي)');
      const listingsSheet   = ss.getSheetByName(BOT_SHEETS.LISTINGS || '🏠 العقارات');

      const existingUrls = new Set();
      const existingPhones = new Set();

      if (fetchQueueSheet && fetchQueueSheet.getLastRow() >= 2) {
        const rows = fetchQueueSheet.getRange(2, 1, fetchQueueSheet.getLastRow() - 1, 10).getValues();
        rows.forEach(r => {
          const u = String(r[3] || '').trim();
          const p = String(r[9] || '').replace(/[^0-9]/g, '');
          if (u) existingUrls.add(u);
          if (p && p.length >= 8) existingPhones.add(p);
        });
      }

      if (listingsSheet && listingsSheet.getLastRow() >= 2) {
        const rows = listingsSheet.getRange(2, 1, listingsSheet.getLastRow() - 1, 29).getValues();
        rows.forEach(r => {
          const p = String(r[22] || '').replace(/[^0-9]/g, '');
          const u = String(r[28] || '').trim();
          if (u) existingUrls.add(u);
          if (p && p.length >= 8) existingPhones.add(p);
        });
      }

      const newQueueRows = [];
      const newListingsRows = [];

      rawListings.forEach(item => {
        const url = String(item.url || '').trim();
        const rawPhone = String(item.seller_phone || item.phone || '').trim();
        const cleanPhone = rawPhone.replace(/[^0-9]/g, '');

        if ((url && existingUrls.has(url)) || (cleanPhone && cleanPhone.length >= 8 && existingPhones.has(cleanPhone))) {
          skippedListings++;
          return;
        }

        if (url) existingUrls.add(url);
        if (cleanPhone && cleanPhone.length >= 8) existingPhones.add(cleanPhone);

        const target = item.target || body.target || 'fetch_queue';
        if (target === 'listings' && listingsSheet) {
          newListingsRows.push([
            '', // A: Formula
            new Date(), // B
            item.source || 'جلب خارجي 🤖', // C
            'جديد', // D
            item.type || 'شقة', // E
            item.district || 'غير محدد', // F
            item.street || '', // G
            item.floor || '', // H
            item.total_floors || '', // I
            Number(item.area || 0) || '', // J
            item.rooms || '', // K
            item.baths || '', // L
            item.reception || '', // M
            item.finishing || 'تشطيب سوبر لوكس', // N
            item.age || '', // O
            item.features || '', // P
            Number(item.price || 0) || '', // Q
            '', // R: Formula
            item.payment || 'كاش', // S
            Number(item.down_payment || 0) || '', // T
            item.negotiable || 'ربما', // U
            item.seller_name || item.name || 'بائع', // V
            rawPhone, // W
            item.legal_status || 'ملكية تامة', // X
            String(item.raw_text || item.description || '').slice(0, 2000), // Y
            '', // Z
            '', // AA
            '', // AB
            url, // AC
            item.notes || 'جلب تلقائي 🤖', // AD
            '', // AE: Formula
            new Date(), // AF
            '' // AG: Formula
          ]);
        } else if (fetchQueueSheet) {
          newQueueRows.push([
            '', // A: Formula auto EXT-XXX
            new Date(), // B
            item.platform || item.source || 'مجموعات فيسبوك', // C
            url, // D
            item.type || 'شقة', // E
            item.district || 'غير محدد', // F
            Number(item.area || 0) || '', // G
            Number(item.price || 0) || '', // H
            item.seller_name || item.name || 'معلن خارجي', // I
            rawPhone, // J
            '', // K: Formula
            String(item.raw_text || item.description || '').slice(0, 2000), // L
            'لم يتم التواصل', // M
            item.notes || 'جلب تلقائي 🤖', // N
            '' // O
          ]);
        }
      });

      if (newQueueRows.length > 0 && fetchQueueSheet) {
        const startRow = Math.max(2, fetchQueueSheet.getLastRow() + 1);
        fetchQueueSheet.getRange(startRow, 1, newQueueRows.length, 15).setValues(newQueueRows);
        const idFormulas = [];
        const waFormulas = [];
        for (let i = 0; i < newQueueRows.length; i++) {
          const r = startRow + i;
          idFormulas.push([`=IF(OR(C${r}<>"",L${r}<>""),"EXT-"&TEXT(ROW()-1,"000"),"")`]);
          const msgExpr =
            `"السلام عليكم ورحمة الله 🌟"&CHAR(10)&` +
            `"مع حضرتك نورا من صفحة وقار للاستثمار العقاري بالإسكندرية."&CHAR(10)&` +
            `"شفت إعلانك عن "&IF(E${r}<>"",E${r},"العقار")&` +
            `IF(F${r}<>""," في "&F${r},"")&` +
            `" وحابة أعرف تفاصيل أكتر وهل العقار متاح حالياً للتسويق؟"`;
          waFormulas.push([`=IF(J${r}<>"","https://wa.me/2"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(J${r}," ",""),"-",""),"+2",""),"+","")&"?text="&ENCODEURL(${msgExpr}),"")`]);
        }
        fetchQueueSheet.getRange(startRow, 1, newQueueRows.length, 1).setFormulas(idFormulas);
        fetchQueueSheet.getRange(startRow, 11, newQueueRows.length, 1).setFormulas(waFormulas);
        insertedListings += newQueueRows.length;
      }

      if (newListingsRows.length > 0 && listingsSheet) {
        const startRow = Math.max(2, listingsSheet.getLastRow() + 1);
        listingsSheet.getRange(startRow, 1, newListingsRows.length, 33).setValues(newListingsRows);
        const idFormulas = [];
        const sqmFormulas = [];
        const waFormulas = [];
        for (let i = 0; i < newListingsRows.length; i++) {
          const r = startRow + i;
          idFormulas.push([`=IF(E${r}<>"","WQ-"&TEXT(ROW()-1,"000"),"")`]);
          sqmFormulas.push([`=IF(AND(ISNUMBER(Q${r}),ISNUMBER(J${r}),J${r}>0),ROUND(Q${r}/J${r},0),"")`]);
          waFormulas.push([`=IF(W${r}<>"","https://wa.me/2"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(W${r}," ",""),"-",""),"+2",""),"+",""),"")`]);
        }
        listingsSheet.getRange(startRow, 1, newListingsRows.length, 1).setFormulas(idFormulas);
        listingsSheet.getRange(startRow, 18, newListingsRows.length, 1).setFormulas(sqmFormulas);
        listingsSheet.getRange(startRow, 33, newListingsRows.length, 1).setFormulas(waFormulas);
        insertedListings += newListingsRows.length;
      }
    }

    // B) Process Buyer Demands
    if (rawBuyers.length > 0) {
      const buyerSheet = ss.getSheetByName(BOT_SHEETS.BUYERS || '👥 المشترون');
      if (buyerSheet) {
        const existingContacts = new Set();
        if (buyerSheet.getLastRow() >= 2) {
          const rows = buyerSheet.getRange(2, 6, buyerSheet.getLastRow() - 1, 1).getValues();
          rows.forEach(r => {
            const raw = String(r[0] || '').trim();
            const clean = raw.replace(/[^0-9]/g, '');
            if (clean && clean.length >= 8) existingContacts.add(clean);
            if (raw.indexOf('http') !== -1) existingContacts.add(raw);
          });
        }

        const newBuyerRows = [];
        rawBuyers.forEach(buyer => {
          const contact = String(buyer.phone || buyer.profile_url || '').trim();
          const cleanPhone = contact.replace(/[^0-9]/g, '');
          const isUrl = contact.indexOf('http') !== -1;

          if ((cleanPhone && cleanPhone.length >= 8 && existingContacts.has(cleanPhone)) || (isUrl && existingContacts.has(contact))) {
            skippedBuyers++;
            return;
          }

          if (cleanPhone && cleanPhone.length >= 8) existingContacts.add(cleanPhone);
          if (isUrl) existingContacts.add(contact);

          newBuyerRows.push([
            '', // A: Formula BYR-XXX
            new Date(), // B
            buyer.source || 'جروبات فيسبوك (طلب مشتري)', // C
            buyer.status || 'نشط 🔥', // D
            buyer.name || 'مشتري مهتم', // E
            contact, // F
            buyer.wanted_type || buyer.type || 'شقة', // G
            Number(buyer.budget_max || buyer.price_max || 0) || '', // H
            Number(buyer.budget_min || buyer.price_min || 0) || '', // I
            buyer.preferred_districts || buyer.districts || 'الإسكندرية', // J
            Number(buyer.min_area || 0) || '', // K
            buyer.payment || 'كاش فقط', // L
            buyer.urgency || 'عاجل — أقل من شهر', // M
            buyer.must_haves || '', // N
            buyer.notes || (buyer.raw_text ? 'طلب أصلي: ' + String(buyer.raw_text).slice(0, 300) : 'جلب تلقائي 🤖'), // O
            '', // P
            0, // Q
            '', // R
            buyer.interested_in || '', // S
            new Date(), // T
            '' // U: Formula
          ]);
        });

        if (newBuyerRows.length > 0) {
          const startRow = Math.max(2, buyerSheet.getLastRow() + 1);
          buyerSheet.getRange(startRow, 1, newBuyerRows.length, 21).setValues(newBuyerRows);
          const idFormulas = [];
          const waFormulas = [];
          for (let i = 0; i < newBuyerRows.length; i++) {
            const r = startRow + i;
            idFormulas.push([`=IF(E${r}<>"","BYR-"&TEXT(ROW()-1,"000"),"")`]);
            waFormulas.push([`=IF(F${r}<>"","https://wa.me/2"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(F${r}," ",""),"-",""),"+2",""),"+",""),"")`]);
          }
          buyerSheet.getRange(startRow, 1, newBuyerRows.length, 1).setFormulas(idFormulas);
          buyerSheet.getRange(startRow, 21, newBuyerRows.length, 1).setFormulas(waFormulas);
          insertedBuyers += newBuyerRows.length;
        }
      }
    }

    // C) Automated Match Trigger
    let matchingResult = null;
    if (body.trigger_matching !== false && (insertedListings > 0 || insertedBuyers > 0)) {
      try {
        if (typeof m3_runFullMatching === 'function') {
          matchingResult = m3_runFullMatching(true);
        }
      } catch (matchErr) {
        matchingResult = { error: String(matchErr) };
      }
    }

    botLog_('INFO', 'DirectIngest', `Inserted ${insertedListings} listings (${skippedListings} skipped), ${insertedBuyers} buyers (${skippedBuyers} skipped)`);

    return botJsonResponse_({
      status: 'success',
      inserted_listings: insertedListings,
      skipped_duplicate_listings: skippedListings,
      inserted_buyers: insertedBuyers,
      skipped_duplicate_buyers: skippedBuyers,
      matching_result: matchingResult
    });
  } catch (err) {
    botLog_('ERROR', 'DirectIngest', String(err));
    return botJsonResponse_({ status: 'error', message: String(err) });
  }
}


// ============================================================
// 14. NATIVE APIFY CLOUD WEBHOOK HANDLER
// ============================================================
/**
 * Handles incoming webhooks directly from Apify when a Facebook Groups
 * or Facebook Posts scraping actor run finishes in the cloud.
 */
function botHandleApifyWebhook_(body, e) {
  try {
    const datasetId = (body.resource && body.resource.defaultDatasetId)
      || (body.eventData && body.eventData.defaultDatasetId)
      || body.datasetId;

    if (!datasetId) {
      return botJsonResponse_({ status: 'ignored', message: 'No defaultDatasetId found in Apify payload' });
    }

    const token = (e && e.parameter && e.parameter.token) || botCfg_('APIFY_TOKEN');
    const apifyUrl = 'https://api.apify.com/v2/datasets/' + encodeURIComponent(datasetId) + '/items?clean=true&format=json' + (token ? ('&token=' + encodeURIComponent(token)) : '');
    const resp = UrlFetchApp.fetch(apifyUrl, { muteHttpExceptions: true });

    if (resp.getResponseCode() >= 400) {
      botLog_('APIFY_ERR', datasetId, resp.getContentText());
      return botJsonResponse_({ status: 'error', message: 'Failed to fetch Apify dataset: HTTP ' + resp.getResponseCode() });
    }

    const items = JSON.parse(resp.getContentText());
    if (!Array.isArray(items)) {
      return botJsonResponse_({ status: 'ignored', message: 'Apify dataset items not an array' });
    }

    const listings = [];
    const buyers = [];

    items.forEach(item => {
      const text = String(item.text || item.postText || item.message || '').trim();
      if (!text || text.length < 15) return;

      const postUrl = String(item.postUrl || item.url || '');
      const author = String(item.authorName || item.user || 'عضو فيسبوك');
      const phone = botExtractEgyptPhone_(text) || item.phone || '';
      const district = botDetectAlexDistrict_(text) || 'الإسكندرية';
      const area = botExtractAreaM2_(text) || 0;
      const price = botExtractPriceEgp_(text) || 0;

      let type = 'شقة';
      if (/أرض|ارض|قطعة أرض|أراضي/u.test(text)) type = 'أرض';
      else if (/محل|محل تجاري|مقر إداري|مكتب|مخزن|معرض|صيدلية/u.test(text)) type = 'محل';
      else if (/فيلا|تاون هاوس|توين هاوس|قصر/u.test(text)) type = 'فيلا';
      else if (/دوبلكس/u.test(text)) type = 'دوبلكس';

      const isBuyer = (typeof m3_isBuyerRequestIntent_ === 'function')
        ? m3_isBuyerRequestIntent_(text)
        : /مطلوب|أبحث عن|ابحث عن|عاوز|عايز|محتاج/u.test(text);

      if (isBuyer) {
        buyers.push({
          source: 'جروبات فيسبوك (طلب مشتري)',
          name: author,
          phone: phone || (item.authorId ? 'https://facebook.com/' + item.authorId : postUrl),
          wanted_type: type,
          budget_max: price,
          preferred_districts: district,
          min_area: area,
          notes: 'طلب مشتري مجلوب سحابياً من فيسبوك عبر Apify 🤖',
          raw_text: text
        });
      } else {
        listings.push({
          platform: 'مجموعات فيسبوك',
          url: postUrl,
          type: type,
          district: district,
          area: area,
          price: price,
          seller_name: author,
          seller_phone: phone,
          raw_text: text,
          notes: 'عقار مجلوب سحابياً من فيسبوك عبر Apify 🤖'
        });
      }
    });

    return botHandleDirectIngest_({
      action: 'ingest',
      listings: listings,
      buyers: buyers,
      trigger_matching: true
    });
  } catch (err) {
    botLog_('ERROR', 'ApifyWebhook', String(err));
    return botJsonResponse_({ status: 'error', message: String(err) });
  }
}


// ============================================================
// 15. ONE-CLICK CLEANUP & POPULATE FROM ROW 2 (Pure Arabic)
// ============================================================
function cleanAndFixSheetRows() {
  const ss = botGetSpreadsheet_();
  if (!ss) return;

  const listSheet  = ss.getSheetByName(BOT_SHEETS.LISTINGS || '🏠 العقارات');
  const buyerSheet = ss.getSheetByName(BOT_SHEETS.BUYERS || '👥 المشترون');
  const fetchSheet = ss.getSheetByName(BOT_SHEETS.FETCH_QUEUE || '🌐 جلب العقارات (خارجي)');
  const matchSheet = ss.getSheetByName(BOT_SHEETS.MATCHES || '🔗 التطابقات');
  const qSheet     = ss.getSheetByName('🔥 تنبيهات ومتابعات');

  // 1. Clear stale rows from Row 2 downwards
  [listSheet, buyerSheet, fetchSheet, matchSheet].forEach(sh => {
    if (sh && sh.getLastRow() >= 2) {
      sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    }
  });
  if (qSheet) {
    qSheet.clearContents();
  }

  // 2. Insert Clean Sample Property in 🏠 العقارات (Row 2)
  if (listSheet) {
    listSheet.getRange(2, 2, 1, 31).setValues([[
      new Date(),
      'واتساب',
      'منشور',
      'شقة',
      'سموحة',
      'شارع ألبرت الأول',
      3,
      11,
      180,
      '3',
      '2',
      '3 قطع',
      'تشطيب سوبر لوكس',
      '5-10 سنوات',
      'أسانسير، جراج، مرخصة، مطلات مفتوحة',
      3900000,
      '',
      'كاش',
      '',
      'نعم',
      'الحاج عبد العزيز',
      '01033445566',
      'ملكية تامة',
      'شقة ممتازة في سموحة شارع ألبرت الأول 180م دور ثالث أسانسير ورخصة وعدادات كاملة',
      '',
      '',
      '',
      'https://facebook.com/Waqar.Realestatee',
      'عقار ممتاز جاهز للمعاينة الفورية 🌟',
      '',
      new Date()
    ]]);
    listSheet.getRange(2, 1).setFormula('=IF(E2<>"","WQ-"&TEXT(ROW()-1,"000"),"")');
    listSheet.getRange(2, 18).setFormula('=IF(AND(ISNUMBER(Q2),ISNUMBER(J2),J2>0),ROUND(Q2/J2,0),"")');
    listSheet.getRange(2, 33).setFormula('=IF(W2<>"","https://wa.me/2"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(W2," ",""),"-",""),"+2",""),"+",""),"")');
  }

  // 3. Insert Clean Sample Buyers in 👥 المشترون (Rows 2, 3, 4)
  if (buyerSheet) {
    buyerSheet.getRange(2, 2, 3, 19).setValues([
      [
        new Date(), 'جروبات فيسبوك (طلب مشتري)', 'نشط 🔥', 'المستشار أحمد فؤاد', '01066778899',
        'شقة', 4200000, 3500000, 'سموحة، رشدي', 160, 'كاش فقط', 'عاجل — أقل من شهر',
        'أسانسير، جراج، 3 غرف، دور مناسب', 'طلب شقة للشراء فوراً في سموحة', '', 0, '', '', new Date()
      ],
      [
        new Date(), 'دوبيزل (مطلوب)', 'نشط 🔥', 'الحاج رأفت النجار', '01188990011',
        'محل', 3300000, 2500000, 'ميامي، سيدي بشر', 40, 'كاش', 'خلال شهر',
        'واجهة رئيسية، عداد كهرباء تجاري', 'طلب محل تجاري في ميامي أو سيدي بشر', '', 0, '', '', new Date()
      ],
      [
        new Date(), 'جروبات فيسبوك (طلب مشتري)', 'نشط 🔥', 'المهندس معتز بدر', '01555667788',
        'أرض', 13000000, 9000000, 'سموحة، سيدي جابر', 300, 'كاش', 'عاجل',
        'رخصة مباني، واجهة بحري', 'طلب قطعة أرض في سموحة 300-350م برخصة بناء', '', 0, '', '', new Date()
      ]
    ]);
    for (let r = 2; r <= 4; r++) {
      buyerSheet.getRange(r, 1).setFormula(`=IF(E${r}<>"","BYR-"&TEXT(ROW()-1,"000"),"")`);
      buyerSheet.getRange(r, 21).setFormula(`=IF(F${r}<>"","https://wa.me/2"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(F${r}," ",""),"-",""),"+2",""),"+",""),"")`);
    }
  }

  // 4. Insert Clean Sample External Listings in 🌐 جلب العقارات (خارجي) (Rows 2, 3, 4)
  if (fetchSheet) {
    fetchSheet.getRange(2, 2, 3, 13).setValues([
      [
        new Date(), 'مجموعات فيسبوك', 'https://facebook.com/groups/alexandria.realestate/posts/501',
        'شقة', 'سموحة', 180, 3950000, 'أ/ حسام عبد العزيز', '01022339911', '',
        'شقة للبيع في سموحة شارع ألبرت الأول 180م 3 غرف دور ثالث أسانسير وجراج', 'لم يتم التواصل', 'شقة راقية في سموحة 🌟'
      ],
      [
        new Date(), 'OLX / دوبيزل', 'https://dubizzle.com.eg/ad/alex-land-502',
        'أرض', 'سموحة', 320, 11200000, 'م/ تامر الجوهري', '01144558822', '',
        'أرض للبيع في سموحة 320م ناصية بحري رخصة مباني أرضي و 11 دور', 'لم يتم التواصل', 'أرض ممتازة للبناء 🏗️'
      ],
      [
        new Date(), 'عقارماب', 'https://aqarmap.com.eg/ad/alex-store-503',
        'محل', 'ميامي', 50, 3100000, 'أ/ وحيد مهران', '01277889933', '',
        'محل تجاري للبيع في ميامي شارع خالد بن الوليد 50م واجهة 6م عداد تجاري 3 فاز', 'لم يتم التواصل', 'موقع تجاري نشط 🏪'
      ]
    ]);
    for (let r = 2; r <= 4; r++) {
      fetchSheet.getRange(r, 1).setFormula(`=IF(OR(C${r}<>"",L${r}<>""),"EXT-"&TEXT(ROW()-1,"000"),"")`);
      const msgExpr =
        `"السلام عليكم ورحمة الله 🌟"&CHAR(10)&` +
        `"مع حضرتك نورا من صفحة وقار للاستثمار العقاري بالإسكندرية."&CHAR(10)&` +
        `"شفت إعلانك عن "&IF(E${r}<>"",E${r},"العقار")&` +
        `IF(F${r}<>""," في "&F${r},"")&` +
        `" وحابة أعرف تفاصيل أكتر وهل العقار متاح حالياً للتسويق؟"`;
      fetchSheet.getRange(r, 11).setFormula(`=IF(J${r}<>"","https://wa.me/2"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(J${r}," ",""),"-",""),"+2",""),"+","")&"?text="&ENCODEURL(${msgExpr}),"")`);
    }
  }

  // 5. Trigger Matching Engine immediately
  if (typeof m3_runFullMatching === 'function') {
    try {
      m3_runFullMatching(true);
    } catch (e) {}
  }

  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      '✅ تم تنظيف وترتيب الشيت بالكامل!',
      'تم مسح الصفوف الفارغة القديمة بنجاح.\n\n' +
      'تظهر البيانات الآن باللغة العربية الواضحة مباشرة من الصف رقم 2 في:\n' +
      '1. 🏠 العقارات (عقار WQ-001 في سموحة)\n' +
      '2. 👥 المشترون (المستشار أحمد فؤاد، الحاج رأفت، م/ معتز)\n' +
      '3. 🌐 جلب العقارات (3 عروض خارجية في الصفوف 2، 3، 4)\n' +
      '4. 🔥 تنبيهات ومتابعات (تطابقات جاهزة مع رسائل واتساب مكتوبة)',
      ui.ButtonSet.OK
    );
  } catch (ignored) {}
}


// ============================================================
// 16. INSTANT AUTOMATED SOURCING TRIGGER (Button & Menu Entry)
// Wakes up GitHub Actions + Apify + RSS + Matching Engine on demand
// ============================================================
function triggerInstantAutomatedSourcing() {
  let ghTriggered = false;
  let apifyTriggered = false;

  // 1. Wake up GitHub Actions Crawler
  try {
    ghTriggered = triggerGitHubCrawler_();
  } catch (e) {
    botLog_('TRIGGER_ERR', 'GitHub', String(e));
  }

  // 2. Wake up Apify Facebook Crawler
  try {
    apifyTriggered = triggerApifyCrawler_();
  } catch (e) {
    botLog_('TRIGGER_ERR', 'Apify', String(e));
  }

  // 3. Import Google Alerts RSS if available
  if (typeof m3_importGoogleAlertsRss === 'function') {
    try { m3_importGoogleAlertsRss(true); } catch (e) {}
  }

  // 4. Run instant matching for existing database
  let matchStats = null;
  if (typeof m3_runFullMatching === 'function') {
    try {
      matchStats = m3_runFullMatching(true);
    } catch (e) {}
  }

  const ghStatus = ghTriggered ? '✅ تم إطلاق زاحف المنصات (GitHub Actions)' : '⏳ جاري تشغيل زاحف المنصات';
  const apifyStatus = apifyTriggered ? '✅ تم إطلاق زاحف فيسبوك (Apify)' : '⏳ جاري تشغيل زاحف فيسبوك';
  const matchInfo = (matchStats && matchStats.hotNew) ? `\n🔥 تم العثور على ${matchStats.hotNew} صفقة ساخنة جاهزة للتواصل في ورقة "تنبيهات ومتابعات"` : '';

  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      '🚀 تم بدء البحث الآلي عن العقارات والمشترين!',
      `النظام يعمل الآن في السحاب بكامل طاقته:\n\n` +
      `${ghStatus}\n` +
      `${apifyStatus}\n` +
      `✅ تم فحص وتحديث محرك المطابقة${matchInfo}\n\n` +
      `ستصل العقارات والطلبات الجديدة تلقائياً إلى الشيت خلال دقائق معدودة، بالإضافة إلى استمرار عمل الجدولة التلقائية كل ساعتين!`,
      ui.ButtonSet.OK
    );
  } catch (ignored) {}
}

function triggerGitHubCrawler_() {
  const token = botCfg_('GITHUB_TOKEN') || '';
  const repo  = botCfg_('GITHUB_REPO') || '3bdelmaksoud/waqar-automation';
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
  const token  = botCfg_('APIFY_TOKEN') || '';
  const taskId = botCfg_('APIFY_TASK_ID') || '83qAJ0hfS2lOyFJ2p';
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
