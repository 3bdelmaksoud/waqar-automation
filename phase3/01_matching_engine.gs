/**
 * ============================================================
 *  WAQAR REAL ESTATE — Phase 3: Full Matching Engine, Dedup,
 *  Follow-up Queue, RSS Feed Fetcher & Daily Digest
 *  وقار للاستثمار العقاري — محرك المطابقة الذكي والمتابعة التلقائية
 * ============================================================
 *  HOW TO INSTALL:
 *  1. Open your Phase 1 Google Spreadsheet > Extensions > Apps Script.
 *  2. Click "+" next to Files > Script > name it: MatchingEngine
 *  3. Paste this entire file and Save (Ctrl+S).
 *     (Zero naming collisions with 01_setup_database.gs or 01_messenger_bot.gs!)
 *  4. Run `m3_installTriggers` once (or from menu: 🏢 وقار للعقارات).
 * ============================================================
 */

var M3_SHEETS = {
  LISTINGS:     '🏠 العقارات',
  BUYERS:       '👥 المشترون',
  FETCH_QUEUE:  '🌐 جلب العقارات (خارجي)',
  MATCHES:      '🔗 التطابقات',
  SETTINGS:     '⚙️ الإعدادات',
  ACTION_QUEUE: '🔥 تنبيهات ومتابعات'
};

// Geographic neighbor map for Alexandria districts (similar location fallback)
var M3_ALEX_NEIGHBORS = {
  'سموحة':       ['سيدي جابر', 'كفر عبده', 'سبورتنج', 'كليوباترا', 'محرم بك'],
  'روشدي':       ['كفر عبده', 'سيدي جابر', 'ستانلي', 'سبورتنج', 'جليم'],
  'سان ستيفانو': ['جليم', 'زيزينيا', 'ستانلي', 'لوران', 'روشدي'],
  'سبورتنج':     ['كليوباترا', 'الإبراهيمية', 'سموحة', 'سيدي جابر', 'روشدي'],
  'ستانلي':      ['سابا باشا', 'روشدي', 'جليم', 'سان ستيفانو', 'سيدي جابر'],
  'جليم':        ['سان ستيفانو', 'ستانلي', 'زيزينيا', 'روشدي', 'لوران'],
  'زيزينيا':     ['جليم', 'سان ستيفانو', 'لوران', 'فيكتوريا'],
  'كفر عبده':    ['روشدي', 'سيدي جابر', 'سموحة', 'ستانلي'],
  'سيدي جابر':   ['سموحة', 'كفر عبده', 'روشدي', 'سبورتنج', 'كليوباترا'],
  'لوران':       ['سان ستيفانو', 'زيزينيا', 'فيكتوريا', 'جليم'],
  'فيكتوريا':    ['لوران', 'زيزينيا', 'سيدي بشر', 'ميامي'],
  'ميامي':       ['سيدي بشر', 'المندرة', 'فيكتوريا', 'المنتزه'],
  'سيدي بشر':    ['ميامي', 'المندرة', 'فيكتوريا', 'لوران'],
  'المندرة':     ['ميامي', 'سيدي بشر', 'المنتزه', 'المعمورة'],
  'كليوباترا':   ['سبورتنج', 'سيدي جابر', 'الإبراهيمية', 'سموحة'],
  'الإبراهيمية': ['سبورتنج', 'كليوباترا', 'محرم بك', 'وسط البلد'],
  'محرم بك':     ['الإبراهيمية', 'سموحة', 'وسط البلد'],
  'المنتزه':     ['المندرة', 'المعمورة', 'ميامي', 'أبو قير'],
  'المعمورة':    ['المنتزه', 'المندرة', 'أبو قير'],
  'أبو قير':     ['المعمورة', 'المنتزه'],
  'العجمي':      ['الهانوفيل', 'البيطاش', 'الدخيلة'],
  'الهانوفيل':   ['العجمي', 'البيطاش'],
  'البيطاش':     ['العجمي', 'الهانوفيل', 'الدخيلة'],
  'الدخيلة':     ['العجمي', 'البيطاش', 'بحري'],
  'وسط البلد':   ['بحري', 'الإبراهيمية', 'محرم بك'],
  'بحري':        ['وسط البلد', 'الدخيلة'],
  'برج العرب':   ['العامرية'],
  'العامرية':    ['برج العرب', 'العجمي']
};


// ============================================================
// 1. SAFE ALERT HELPER (No crash when run from editor/trigger)
// ============================================================
function m3_alert_(title, msg) {
  Logger.log('[' + title + ']\n' + msg);
  try {
    SpreadsheetApp.getUi().alert(title, msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast(title, 'وقار — محرك المطابقة', 7);
    } catch (ignored) {}
  }
}

function m3_ss_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID missing in ScriptProperties.');
  return SpreadsheetApp.openById(id);
}


// ============================================================
// 2. LOAD DYNAMIC SETTINGS (Weights, Thresholds & District Tiers)
// ============================================================
function m3_loadConfig_(ss) {
  const cfg = {
    hotThreshold: 85,
    warmThreshold: 60,
    wBudget: 35,
    wLocation: 30,
    wTypeSize: 20,
    wPayment: 10,
    wMustHaves: 5,
    tiers: {},
    alertEmail: PropertiesService.getScriptProperties().getProperty('NOURA_ALERT_EMAIL') || '',
    rssFeedsRaw: PropertiesService.getScriptProperties().getProperty('GOOGLE_ALERTS_RSS_URLS') || ''
  };

  const settSheet = ss.getSheetByName(M3_SHEETS.SETTINGS);
  if (!settSheet) return cfg;

  const rows = settSheet.getDataRange().getValues();
  rows.forEach(r => {
    const k = String(r[0] || '').trim();
    const v = r[1];
    if (!k) return;

    if (k.indexOf('ليد ساخن') !== -1 && Number(v) > 0) cfg.hotThreshold = Number(v);
    else if (k.indexOf('ليد دافئ') !== -1 && Number(v) > 0) cfg.warmThreshold = Number(v);
    else if (k.indexOf('وزن الميزانية') !== -1 && Number(v) >= 0) cfg.wBudget = Number(v);
    else if (k.indexOf('وزن الموقع') !== -1 && Number(v) >= 0) cfg.wLocation = Number(v);
    else if (k.indexOf('وزن النوع') !== -1 && Number(v) >= 0) cfg.wTypeSize = Number(v);
    else if (k.indexOf('وزن طريقة الدفع') !== -1 && Number(v) >= 0) cfg.wPayment = Number(v);
    else if (k.indexOf('وزن المواصفات') !== -1 && Number(v) >= 0) cfg.wMustHaves = Number(v);
    else if (k.indexOf('بريد التنبيهات') !== -1 && String(v).indexOf('@') !== -1) cfg.alertEmail = String(v).trim();
    else if (k.indexOf('روابط Google Alerts') !== -1 && String(v).indexOf('http') !== -1) cfg.rssFeedsRaw = String(v).trim();
    else if (v === 'Prime' || v === 'Mid' || v === 'Suburban') {
      cfg.tiers[k] = String(v);
    }
  });

  return cfg;
}


// ============================================================
// 3. CORE SCORING ALGORITHM (Alexandria Asset-Aware & Anti-Inflation)
// ============================================================
function m3_scorePair_(listing, buyer, cfg) {
  // Hard filter 1: Unit type mismatch on specialized types (Land vs Apartment vs Store)
  if (!m3_typesCompatible_(listing.type, buyer.wantedType)) {
    return { score: 0, reasons: [], category: 'rejected', rejected: 'نوع وحدة غير متوافق' };
  }

  // Hard filter 2: Price way above buyer max (>30% over, or >15% if strictly non-negotiable cash)
  if (buyer.budgetMax > 0 && buyer.budgetMax < 90000000 && listing.price > 0) {
    const maxFactor = (listing.negotiable === 'نعم' || listing.negotiable === 'ربما' || String(listing.payment).indexOf('تقسيط') !== -1)
      ? 1.25
      : 1.15;
    if (listing.price > buyer.budgetMax * 1.30 || listing.price > buyer.budgetMax * maxFactor) {
      return { score: 0, reasons: [], category: 'rejected', rejected: 'السعر يتجاوز الميزانية' };
    }
  }

  const haystack = [listing.features, listing.finishing, listing.rawDesc, listing.street, listing.legalStatus].join(' ');

  // Hard filter 3: High floor without elevator when buyer explicitly requires elevator
  const isMultiFloorRes = ['شقة', 'دوبلكس', 'بنتهاوس'].indexOf(listing.type) !== -1;
  if (isMultiFloorRes && buyer.mustHaves && buyer.mustHaves.indexOf('أسانسير') !== -1) {
    const floorNum = Number(listing.floor || 0);
    const hasElevator = /أسانسير|اسانسير|مصعد/.test(haystack);
    if (floorNum >= 5 && !hasElevator) {
      return { score: 0, reasons: [], category: 'rejected', rejected: 'دور مرتفع (' + floorNum + ') بدون أسانسير' };
    }
  }

  let score = 0;
  const reasons = [];
  let overBudgetStretch = false;

  // 1) Budget Fit (default max 35)
  const wB = cfg.wBudget;
  if (listing.price <= 0) {
    // Missing listing price earns 0 budget points and cannot become a Warm/Hot pitch
    reasons.push('السعر غير محدد (يحتاج تأكيد)');
  } else if (buyer.budgetMax <= 0 || buyer.budgetMax >= 90000000) {
    score += Math.round(wB * 0.65);
    reasons.push('ميزانية مرنة');
  } else if (listing.price <= buyer.budgetMax) {
    if (buyer.budgetMin > 0 && listing.price < buyer.budgetMin * 0.65) {
      score += Math.round(wB * 0.65);
      reasons.push('أقل من الشريحة المستهدفة');
    } else {
      score += wB;
      reasons.push('ضمن الميزانية');
    }
  } else if (listing.price <= buyer.budgetMax * 1.10) {
    score += Math.round(wB * 0.60);
    overBudgetStretch = true;
    reasons.push('أعلى من الميزانية حتى 10%');
  } else if (listing.price <= buyer.budgetMax * 1.25 && (listing.negotiable === 'نعم' || listing.negotiable === 'ربما')) {
    score += Math.round(wB * 0.38);
    overBudgetStretch = true;
    reasons.push('قابل للتفاوض (أعلى بـ ≤25%)');
  }

  // 2) Location Fit (default max 30)
  const wL = cfg.wLocation;
  const locResult = m3_scoreLocation_(listing.district, buyer.preferredAreas, cfg.tiers, wL);
  score += locResult.points;
  if (locResult.reason) reasons.push(locResult.reason);

  // 3) Unit Type & Size Fit (default max 20)
  const wT = cfg.wTypeSize;
  const typePts = Math.round(wT * 0.60);
  const sizePts = wT - typePts;
  score += typePts;
  reasons.push('النوع: ' + listing.type);

  if (buyer.minArea > 0) {
    if (listing.area >= buyer.minArea) {
      score += sizePts;
      reasons.push('مساحة مناسبة (' + listing.area + 'م²)');
    } else if (listing.area > 0 && listing.area >= buyer.minArea * 0.88) {
      score += Math.round(sizePts * 0.50);
      reasons.push('مساحة قريبة (' + listing.area + 'م²)');
    }
  } else if (listing.area > 0) {
    score += sizePts;
  } else {
    score += Math.round(sizePts * 0.30);
  }

  // 4) Payment Method Fit (default max 10)
  const wP = cfg.wPayment;
  if (m3_paymentCompatible_(listing.payment, buyer.payment)) {
    score += wP;
    reasons.push('دفع متوافق (' + (listing.payment || 'مرن') + ')');
  }

  // 5) Must-Haves & Asset Signals Fit (default max 5)
  const wM = cfg.wMustHaves;
  if (!buyer.mustHaves || buyer.mustHaves.indexOf('ما عنديش شروط') !== -1) {
    score += Math.round(wM * 0.80);
  } else {
    const reqList = String(buyer.mustHaves).split(/[,،]+/).map(s => s.trim()).filter(Boolean);
    let matchedCount = 0;
    reqList.forEach(req => {
      const token = req.replace(/\(.*?\)/g, '').trim();
      if (token && haystack.indexOf(token) !== -1) matchedCount++;
    });
    if (reqList.length > 0 && matchedCount > 0) {
      score += Math.round((matchedCount / reqList.length) * wM);
      reasons.push('مزايا متوفرة (' + matchedCount + '/' + reqList.length + ')');
    }
  }

  // Surface verified legal/asset-specific value signals in reasons
  if (listing.legalStatus && (listing.legalStatus === 'ملكية تامة' || listing.legalStatus === 'تمليك')) {
    reasons.push(listing.legalStatus);
  }
  if (listing.type === 'أرض' && /ناصية|واجهة|رخصة/.test(haystack)) {
    reasons.push('مزايا أرض مميزة');
  } else if (listing.type === 'محل تجاري' && /3 فاز|رئيسي|سندرة|ناصية|مؤجر/.test(haystack)) {
    reasons.push('موقع/مرافق تجارية قوية');
  }

  let category = 'exact';
  if (overBudgetStretch) category = 'price_alt';
  else if (locResult.matchType && locResult.matchType !== 'exact' && locResult.matchType !== 'open') category = 'location_alt';

  let finalScore = Math.min(100, Math.round(score));
  if (listing.price <= 0) {
    finalScore = Math.min(55, finalScore);
  }

  return {
    score: finalScore,
    reasons: reasons,
    category: category,
    rejected: null
  };
}

function m3_typesCompatible_(listingType, buyerWanted) {
  const lt = String(listingType || '').trim();
  const bw = String(buyerWanted || '').trim();
  if (!bw || bw === 'أي نوع' || bw === 'أي نوع مناسب') return true;
  if (!lt) return true;
  if (bw.indexOf(lt) !== -1 || lt.indexOf(bw) !== -1) return true;
  // Villa / Duplex / Penthouse group compatibility
  const villaGroup = ['فيلا', 'دوبلكس', 'بنتهاوس'];
  if (villaGroup.indexOf(lt) !== -1 && villaGroup.some(g => bw.indexOf(g) !== -1)) return true;
  return false;
}

function m3_scoreLocation_(listingDistrict, preferredAreas, tiers, weight) {
  const ld = String(listingDistrict || '').trim();
  const pa = String(preferredAreas || '').trim();
  if (!pa || pa.indexOf('أي منطقة') !== -1) {
    return { points: weight, matchType: 'open', reason: 'المشتري مرن في المنطقة' };
  }
  if (!ld || ld === 'منطقة أخرى') {
    return { points: Math.round(weight * 0.2), matchType: 'other', reason: '' };
  }
  if (pa.indexOf(ld) !== -1) {
    return { points: weight, matchType: 'exact', reason: 'تطابق تام في المنطقة (' + ld + ')' };
  }

  // Check neighbor adjacency
  const neighbors = M3_ALEX_NEIGHBORS[ld] || [];
  for (let i = 0; i < neighbors.length; i++) {
    if (pa.indexOf(neighbors[i]) !== -1) {
      return { points: Math.round(weight * 0.65), matchType: 'neighbor', reason: 'منطقة مجاورة لـ ' + neighbors[i] };
    }
  }

  // Check same price/prestige tier (Prime / Mid / Suburban)
  const listingTier = tiers[ld];
  if (listingTier) {
    const buyerDistricts = pa.split(/[,،/]+/).map(s => s.trim()).filter(Boolean);
    const sameTier = buyerDistricts.some(bd => tiers[bd] === listingTier);
    if (sameTier) {
      return { points: Math.round(weight * 0.35), matchType: 'tier', reason: 'نفس المستوى السعري (' + listingTier + ')' };
    }
  }

  return { points: 0, matchType: 'none', reason: '' };
}

function m3_paymentCompatible_(listingPay, buyerPay) {
  const lp = String(listingPay || '').trim();
  const bp = String(buyerPay || '').trim();
  if (!lp || !bp) return true;
  if (lp === 'كاش أو تقسيط' || bp === 'كاش أو تقسيط') return true;
  if (bp.indexOf('كاش') !== -1 && lp.indexOf('كاش') !== -1) return true;
  if (bp.indexOf('تقسيط') !== -1 && lp.indexOf('تقسيط') !== -1) return true;
  return false;
}


// ============================================================
// 4. DATA LOADERS FROM SHEETS
// ============================================================
function m3_getActiveListings_(ss) {
  const sheet = ss.getSheetByName(M3_SHEETS.LISTINGS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 32).getValues();
  const list = [];

  rows.forEach((r, i) => {
    const type = String(r[4] || '').trim();
    const status = String(r[3] || '').trim();
    if (!type) return;
    // Match only reviewed or published listings (never postponed/sold/archived/unreviewed drafts)
    if (status !== 'منشور' && status !== 'تمت المراجعة') return;

    const area = Number(r[9] || 0);
    const price = Number(r[16] || 0);
    const perSqm = Number(r[17] || 0) || (area > 0 && price > 0 ? Math.round(price / area) : 0);

    list.push({
      row: i + 2,
      id: String(r[0] || ('WQ-' + String(i + 1).padStart(3, '0'))),
      regDate: r[1] ? new Date(r[1]) : null,
      status: status,
      type: type,
      district: String(r[5] || '').trim(),
      street: String(r[6] || '').trim(),
      floor: Number(r[7] || 0),
      totalFloors: Number(r[8] || 0),
      area: area,
      rooms: String(r[10] || '').trim(),
      finishing: String(r[13] || '').trim(),
      features: String(r[15] || '').trim(),
      price: price,
      pricePerSqm: perSqm,
      payment: String(r[18] || '').trim(),
      negotiable: String(r[20] || '').trim(),
      sellerName: String(r[21] || '').trim(),
      sellerPhone: String(r[22] || '').trim(),
      legalStatus: String(r[23] || '').trim(),
      rawDesc: String(r[24] || '').trim(),
      fbLink: String(r[27] || '').trim()
    });
  });

  return list;
}

function m3_computeDistrictSqmAvg_(listings) {
  const buckets = {};
  (listings || []).forEach(l => {
    if (l.district && l.type && l.pricePerSqm > 0) {
      const k = l.district + '|' + l.type;
      if (!buckets[k]) buckets[k] = { sum: 0, count: 0 };
      buckets[k].sum += l.pricePerSqm;
      buckets[k].count++;
    }
  });
  const avgs = {};
  Object.keys(buckets).forEach(k => {
    if (buckets[k].count >= 2) avgs[k] = Math.round(buckets[k].sum / buckets[k].count);
  });
  return avgs;
}

function m3_getActiveBuyers_(ss) {
  const sheet = ss.getSheetByName(M3_SHEETS.BUYERS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 20).getValues();
  const buyers = [];

  rows.forEach((r, i) => {
    const name = String(r[4] || '').trim();
    const status = String(r[3] || '').trim();
    if (!name) return;
    if (status.indexOf('مغلق') !== -1) return; // Skip closed deals

    buyers.push({
      row: i + 2,
      id: String(r[0] || ('BYR-' + String(i + 1).padStart(3, '0'))),
      regDate: r[1] ? new Date(r[1]) : null,
      status: status,
      name: name,
      phone: String(r[5] || '').trim(),
      wantedType: String(r[6] || '').trim(),
      budgetMax: Number(r[7] || 0),
      budgetMin: Number(r[8] || 0),
      preferredAreas: String(r[9] || '').trim(),
      minArea: Number(r[10] || 0),
      payment: String(r[11] || '').trim(),
      timeline: String(r[12] || '').trim(),
      mustHaves: String(r[13] || '').trim(),
      lastContact: r[15] ? new Date(r[15]) : null
    });
  });

  return buyers;
}

function m3_getExistingMatchKeys_(matchSheet) {
  const keys = new Set();
  if (!matchSheet || matchSheet.getLastRow() < 2) return keys;
  const rows = matchSheet.getRange(2, 3, matchSheet.getLastRow() - 1, 2).getValues();
  rows.forEach(r => {
    if (r[0] && r[1]) keys.add(String(r[0]).trim() + '|' + String(r[1]).trim());
  });
  return keys;
}


// ============================================================
// 5. FULL MATCHING ENGINE + SINGLE-ROW MATCHERS
// ============================================================
function m3_runFullMatching(silent) {
  const ss = m3_ss_();
  const cfg = m3_loadConfig_(ss);
  const listings = m3_getActiveListings_(ss);
  const buyers   = m3_getActiveBuyers_(ss);
  const matchSheet = ss.getSheetByName(M3_SHEETS.MATCHES);
  if (!matchSheet) throw new Error('لم يتم العثور على ورقة 🔗 التطابقات');

  const existing = m3_getExistingMatchKeys_(matchSheet);
  const newRows = [];
  let hotCount = 0;

  buyers.forEach(buyer => {
    const candidates = [];
    listings.forEach(listing => {
      const key = listing.id + '|' + buyer.id;
      if (existing.has(key)) return;
      const res = m3_scorePair_(listing, buyer, cfg);
      if (res.score >= cfg.warmThreshold) {
        candidates.push({ listing, score: res.score, reasons: res.reasons });
      }
    });

    candidates.sort((a, b) => b.score - a.score);
    // Keep top 5 matches per buyer per run so Matches sheet stays high-signal
    candidates.slice(0, 5).forEach(m => {
      existing.add(m.listing.id + '|' + buyer.id);
      if (m.score >= cfg.hotThreshold) hotCount++;
      newRows.push([
        new Date(),
        m.listing.id,
        buyer.id,
        buyer.name,
        buyer.phone,
        m.listing.type,
        m.listing.district,
        m.listing.price,
        m.score,
        m.reasons.join(' + '),
        'لم يُرسل'
      ]);
    });
  });

  if (newRows.length > 0) {
    const startRow = m3_firstEmptyRow_(matchSheet, 3);
    matchSheet.getRange(startRow, 2, newRows.length, 11).setValues(newRows);
  }

  m3_buildActionQueueSheet(true);

  if (!silent) {
    m3_alert_(
      '🎯 اكتملت عملية المطابقة',
      `تم فحص ${listings.length} عقار نشط × ${buyers.length} مشتري نشط.\n\n` +
      `✅ تطابقات جديدة مضافة: ${newRows.length}\n` +
      `🔥 تطابقات ساخنة (≥ ${cfg.hotThreshold}%): ${hotCount}\n\n` +
      `افتحي ورقة 🔥 تنبيهات ومتابعات لإرسال العروض بضغطة واحدة!`
    );
  }

  return { totalNew: newRows.length, hotNew: hotCount };
}

function m3_matchSelectedListing() {
  const ss = m3_ss_();
  const active = ss.getActiveSheet();
  if (active.getName() !== M3_SHEETS.LISTINGS) {
    m3_alert_('تنبيه', 'افتحي ورقة 🏠 العقارات وحددي صف العقار أولاً.');
    return;
  }
  const row = active.getActiveRange().getRow();
  if (row < 2) {
    m3_alert_('تنبيه', 'حددي صف عقار (الصف 2 أو أكثر).');
    return;
  }

  const cfg = m3_loadConfig_(ss);
  const r = active.getRange(row, 1, 1, 32).getValues()[0];
  const listing = {
    row: row,
    id: String(r[0] || ('WQ-' + String(row - 1).padStart(3, '0'))),
    type: String(r[4] || '').trim(),
    district: String(r[5] || '').trim(),
    street: String(r[6] || '').trim(),
    area: Number(r[9] || 0),
    finishing: String(r[13] || '').trim(),
    features: String(r[15] || '').trim(),
    price: Number(r[16] || 0),
    payment: String(r[18] || '').trim(),
    negotiable: String(r[20] || '').trim(),
    rawDesc: String(r[24] || '').trim(),
    fbLink: String(r[27] || '').trim()
  };

  if (!listing.type) {
    m3_alert_('بيانات ناقصة', 'الصف المحدد فارغ.');
    return;
  }

  const buyers = m3_getActiveBuyers_(ss);
  const matchSheet = ss.getSheetByName(M3_SHEETS.MATCHES);
  const existing = m3_getExistingMatchKeys_(matchSheet);
  const hits = [];

  buyers.forEach(b => {
    const res = m3_scorePair_(listing, b, cfg);
    if (res.score >= cfg.warmThreshold) {
      hits.push({ buyer: b, score: res.score, reasons: res.reasons });
    }
  });

  hits.sort((a, b) => b.score - a.score);
  const toInsert = [];
  hits.forEach(h => {
    const key = listing.id + '|' + h.buyer.id;
    if (!existing.has(key)) {
      existing.add(key);
      toInsert.push([
        new Date(), listing.id, h.buyer.id, h.buyer.name, h.buyer.phone,
        listing.type, listing.district, listing.price, h.score,
        h.reasons.join(' + '), 'لم يُرسل'
      ]);
    }
  });

  if (toInsert.length > 0 && matchSheet) {
    const startRow = m3_firstEmptyRow_(matchSheet, 3);
    matchSheet.getRange(startRow, 2, toInsert.length, 11).setValues(toInsert);
  }
  m3_buildActionQueueSheet(true);

  if (hits.length === 0) {
    m3_alert_('نتائج مطابقة ' + listing.id, 'لا يوجد مشترون مطابقون بنسبة ≥ ' + cfg.warmThreshold + '% حالياً.');
    return;
  }

  const preview = hits.slice(0, 5).map((h, i) =>
    `${i + 1}) ${h.buyer.name} (${h.score}%) — ${h.buyer.phone || 'بدون رقم'}\n   ${h.reasons.join(' + ')}`
  ).join('\n\n');

  m3_alert_(
    `🎯 أفضل المشترين للعقار ${listing.id}`,
    `تم العثور على ${hits.length} مشترٍ (أضيف ${toInsert.length} سجل جديد):\n\n${preview}`
  );
}

function m3_matchSelectedBuyer() {
  const ss = m3_ss_();
  const active = ss.getActiveSheet();
  if (active.getName() !== M3_SHEETS.BUYERS) {
    m3_alert_('تنبيه', 'افتحي ورقة 👥 المشترون وحددي صف المشتري أولاً.');
    return;
  }
  const row = active.getActiveRange().getRow();
  if (row < 2) {
    m3_alert_('تنبيه', 'حددي صف مشترٍ (الصف 2 أو أكثر).');
    return;
  }

  const cfg = m3_loadConfig_(ss);
  const r = active.getRange(row, 1, 1, 20).getValues()[0];
  const buyer = {
    id: String(r[0] || ('BYR-' + String(row - 1).padStart(3, '0'))),
    name: String(r[4] || '').trim(),
    phone: String(r[5] || '').trim(),
    wantedType: String(r[6] || '').trim(),
    budgetMax: Number(r[7] || 0),
    budgetMin: Number(r[8] || 0),
    preferredAreas: String(r[9] || '').trim(),
    minArea: Number(r[10] || 0),
    payment: String(r[11] || '').trim(),
    mustHaves: String(r[13] || '').trim()
  };

  if (!buyer.name) {
    m3_alert_('بيانات ناقصة', 'الصف المحدد فارغ.');
    return;
  }

  const listings = m3_getActiveListings_(ss);
  const matchSheet = ss.getSheetByName(M3_SHEETS.MATCHES);
  const existing = m3_getExistingMatchKeys_(matchSheet);
  const hits = [];

  listings.forEach(l => {
    const res = m3_scorePair_(l, buyer, cfg);
    if (res.score >= cfg.warmThreshold) {
      hits.push({ listing: l, score: res.score, reasons: res.reasons });
    }
  });

  hits.sort((a, b) => b.score - a.score);
  const top5 = hits.slice(0, 5);
  const toInsert = [];
  top5.forEach(h => {
    const key = h.listing.id + '|' + buyer.id;
    if (!existing.has(key)) {
      existing.add(key);
      toInsert.push([
        new Date(), h.listing.id, buyer.id, buyer.name, buyer.phone,
        h.listing.type, h.listing.district, h.listing.price, h.score,
        h.reasons.join(' + '), 'لم يُرسل'
      ]);
    }
  });

  if (toInsert.length > 0 && matchSheet) {
    const startRow = m3_firstEmptyRow_(matchSheet, 3);
    matchSheet.getRange(startRow, 2, toInsert.length, 11).setValues(toInsert);
  }
  m3_buildActionQueueSheet(true);

  if (top5.length === 0) {
    m3_alert_('نتائج البحث لـ ' + buyer.name, 'لا توجد عقارات متاحة تطابق طلب المشتري حالياً.');
    return;
  }

  const top1 = top5[0].listing;
  const readyPitch =
    `السلام عليكم أ/ ${buyer.name} 🌟\n` +
    `مع حضرتك نورا من وقار للاستثمار العقاري بالإسكندرية.\n` +
    `بخصوص طلبك لـ (${buyer.wantedType || 'عقار'} في ${buyer.preferredAreas || 'الإسكندرية'}):\n` +
    `متوفر لدينا ${top1.type} في ${top1.district} (${top1.area} م²) بسعر ${Number(top1.price).toLocaleString('en-US')} ج (كود ${top1.id}) مناسبة جداً لميزانيتك ومواصفاتك!\n` +
    `تحب أبعثلك الصور والتفاصيل للمعاينة؟`;

  const preview = top5.map((h, i) =>
    `${i + 1}) ${h.listing.id}: ${h.listing.type} في ${h.listing.district} (${Number(h.listing.price).toLocaleString('en-US')} ج) — ${h.score}%`
  ).join('\n');

  m3_alert_(
    `🔑 أفضل العقارات لـ ${buyer.name}`,
    `تم العثور على ${top5.length} عقارات مطابقة:\n\n${preview}\n\n` +
    `📝 رسالة مقترحة جاهزة للإرسال للمشتري:\n-------------------------------------\n${readyPitch}`
  );
}


// ============================================================
// 6. DUPLICATE LISTING DETECTOR (Internal + External Queue)
// ============================================================
function m3_checkDuplicates(silent) {
  const ss = m3_ss_();
  const listSheet  = ss.getSheetByName(M3_SHEETS.LISTINGS);
  const fetchSheet = ss.getSheetByName(M3_SHEETS.FETCH_QUEUE);

  const inventory = [];
  if (listSheet && listSheet.getLastRow() >= 2) {
    const lRows = listSheet.getRange(2, 1, listSheet.getLastRow() - 1, 25).getValues();
    lRows.forEach((r, i) => {
      if (!r[4]) return;
      inventory.push({
        row: i + 2,
        id: String(r[0] || ('WQ-' + String(i + 1).padStart(3, '0'))),
        type: String(r[4] || '').trim(),
        district: String(r[5] || '').trim(),
        area: Number(r[9] || 0),
        price: Number(r[16] || 0),
        phone: m3_digitsPhone_(r[22])
      });
    });
  }

  const duplicatesFound = [];

  // A) Check internal duplicates among 🏠 العقارات
  for (let i = 0; i < inventory.length; i++) {
    for (let j = i + 1; j < inventory.length; j++) {
      if (m3_isLikelyDuplicate_(inventory[i], inventory[j])) {
        duplicatesFound.push({
          source: 'قاعدة العقارات',
          itemId: inventory[j].id,
          duplicateOf: inventory[i].id,
          detail: `${inventory[j].type} في ${inventory[j].district} (${inventory[j].area}م² / ${inventory[j].price})`
        });
      }
    }
  }

  // B) Check 🌐 جلب العقارات (خارجي) against 🏠 العقارات
  if (fetchSheet && fetchSheet.getLastRow() >= 2) {
    const fRows = fetchSheet.getRange(2, 1, fetchSheet.getLastRow() - 1, 15).getValues();
    fRows.forEach((r, i) => {
      const fStatus = String(r[12] || '');
      if (!r[2] && !r[11]) return;
      if (fStatus.indexOf('مكرر') !== -1 || fStatus.indexOf('رفض') !== -1) return;

      const ext = {
        id: String(r[0] || ('EXT-' + String(i + 1).padStart(3, '0'))),
        type: String(r[4] || '').trim(),
        district: String(r[5] || '').trim(),
        area: Number(r[6] || 0),
        price: Number(r[7] || 0),
        phone: m3_digitsPhone_(r[9])
      };

      const match = inventory.find(inv => m3_isLikelyDuplicate_(inv, ext));
      if (match) {
        fetchSheet.getRange(i + 2, 13).setValue('مكرر 🔁');
        fetchSheet.getRange(i + 2, 14).setValue('تطابق محتمل مع ' + match.id);
        duplicatesFound.push({
          source: 'جلب خارجي',
          itemId: ext.id,
          duplicateOf: match.id,
          detail: `${ext.type || 'عقار'} في ${ext.district || '-'} — رقم هاتف/مواصفات مطابقة لـ ${match.id}`
        });
      }
    });
  }

  if (!silent) {
    m3_alert_(
      '🔍 فحص التكرارات',
      duplicatesFound.length === 0
        ? '✅ لم يتم العثور على أي عقارات مكررة.'
        : `⚠️ تم اكتشاف ${duplicatesFound.length} تكرار محتمل:\n\n` +
          duplicatesFound.slice(0, 8).map(d => `• ${d.itemId} (${d.source}) يشبه ${d.duplicateOf}`).join('\n')
    );
  }
  return duplicatesFound;
}

function m3_isLikelyDuplicate_(a, b) {
  // Same seller phone + same district + same unit type
  if (a.phone && b.phone && a.phone.slice(-9) === b.phone.slice(-9)) {
    if (a.district && b.district && a.district === b.district && a.type === b.type) {
      if (!a.area || !b.area || Math.abs(a.area - b.area) / Math.max(a.area, b.area) <= 0.05) {
        return true;
      }
    }
  }
  // Exact same district + type + area ±5% + price ±5%
  if (a.district && b.district && a.district === b.district &&
      a.type && b.type && a.type === b.type &&
      a.area > 0 && b.area > 0 && a.price > 0 && b.price > 0) {
    const areaDiff  = Math.abs(a.area - b.area) / Math.max(a.area, b.area);
    const priceDiff = Math.abs(a.price - b.price) / Math.max(a.price, b.price);
    if (areaDiff <= 0.05 && priceDiff <= 0.05) return true;
  }
  return false;
}


// ============================================================
// 7. VALUE-FRAMED PITCH BUILDER & ACTION QUEUE (🔥 تنبيهات ومتابعات)
// Generates persuasive, privacy-safe 1-click WhatsApp links + Seller feedback
// ============================================================
function m3_buildBuyerPitch_(buyerName, listing, score, reasonSummary, districtAvgMap) {
  const namePart = buyerName ? ` أ/ ${buyerName}` : '';
  const unitId = listing.id || '';
  const type = listing.type || 'عقار';
  const district = listing.district || 'الإسكندرية';
  const areaPart = listing.area > 0 ? ` بمساحة ${listing.area} م²` : '';
  const priceStr = listing.price > 0 ? `${Number(listing.price).toLocaleString('en-US')} ج` : 'سعر مميز';
  const perSqm = listing.pricePerSqm || (listing.area > 0 && listing.price > 0 ? Math.round(listing.price / listing.area) : 0);

  let valueHook = '';
  const avgKey = district + '|' + type;
  const distAvg = districtAvgMap && districtAvgMap[avgKey] ? districtAvgMap[avgKey] : 0;
  if (perSqm > 0) {
    valueHook = ` (سعر المتر ${perSqm.toLocaleString('en-US')} ج`;
    if (distAvg > 0 && perSqm < distAvg * 0.95) {
      valueHook += ` — أقل من متوسط المنطقة!`;
    }
    valueHook += `)`;
  }

  const extras = [];
  if (listing.finishing && listing.finishing.indexOf('غير منطبق') === -1) extras.push(listing.finishing);
  if (listing.legalStatus && listing.legalStatus !== 'غير محدد') extras.push(listing.legalStatus);
  if (listing.negotiable === 'نعم') extras.push('قابل للتفاوض');
  if (listing.payment) extras.push(listing.payment);

  let whyLine = '';
  if (reasonSummary && reasonSummary.indexOf('منطقة مجاورة') !== -1) {
    whyLine = `💡 ترشيح بديل ذكي قريب من منطقتك وبنفس المستوى السعري.\n`;
  } else if (reasonSummary && reasonSummary.indexOf('أعلى من الميزانية') !== -1) {
    whyLine = `💡 أعلى قليلاً من الميزانية لكن البائع مرن وقابل للتفاوض الجاد.\n`;
  }

  return (
    `السلام عليكم${namePart} 🌟\n` +
    `مع حضرتك نورا من وقار للاستثمار العقاري بالإسكندرية.\n` +
    `رشحنا لك (${type}${areaPart}) في ${district} — كود ${unitId} (تطابق ${score}%):\n` +
    `💰 السعر: ${priceStr}${valueHook}\n` +
    (extras.length ? `✅ المواصفات: ${extras.join(' | ')}\n` : '') +
    whyLine +
    `تحب أبعثلك الصور والموقع التقريبي، ولا نحدد ميعاد معاينة؟`
  );
}

function m3_buildActionQueueSheet(silent) {
  const ss = m3_ss_();
  const cfg = m3_loadConfig_(ss);
  let qSheet = ss.getSheetByName(M3_SHEETS.ACTION_QUEUE);
  if (!qSheet) {
    qSheet = ss.insertSheet(M3_SHEETS.ACTION_QUEUE);
  } else {
    qSheet.clearContents();
    qSheet.clearFormats();
  }
  try { qSheet.setRightToLeft(true); } catch (e) {}

  const actions = [];
  const now = new Date();
  const msDay = 86400000;

  // Load active listings map for rich persuasive pitches + stale-listing check
  const activeListings = m3_getActiveListings_(ss);
  const listingById = {};
  activeListings.forEach(l => { listingById[l.id] = l; });
  const districtAvgMap = m3_computeDistrictSqmAvg_(activeListings);
  const interestedCountByListing = {};

  // 1) Hot & Unsent Matches from 🔗 التطابقات
  const matchSheet = ss.getSheetByName(M3_SHEETS.MATCHES);
  if (matchSheet && matchSheet.getLastRow() >= 2) {
    const mRows = matchSheet.getRange(2, 1, matchSheet.getLastRow() - 1, 13).getValues();
    mRows.forEach((r, i) => {
      if (!r[2]) return;
      const mId      = String(r[0] || ('MTH-' + String(i + 1).padStart(3, '0')));
      const listId   = String(r[2]);
      const buyerName= String(r[4] || '');
      const buyerWA  = String(r[5] || '');
      const type     = String(r[6] || '');
      const district = String(r[7] || '');
      const price    = Number(r[8] || 0);
      const score    = Number(r[9] || 0);
      const reasons  = String(r[10] || '');
      const sendStat = String(r[11] || 'لم يُرسل');
      const sentDate = r[12] ? new Date(r[12]) : (r[1] ? new Date(r[1]) : null);

      if (sendStat === 'مهتم 👍' || sendStat === 'مكتمل ✅') {
        interestedCountByListing[listId] = (interestedCountByListing[listId] || 0) + 1;
      }

      if (sendStat === 'لم يُرسل' && score >= cfg.warmThreshold) {
        const tierLabel = score >= cfg.hotThreshold ? '🔥 تطابق ساخن' : '🌡️ تطابق دافئ';
        const fullListing = listingById[listId] || { id: listId, type, district, price, area: 0 };
        const msg = m3_buildBuyerPitch_(buyerName, fullListing, score, reasons, districtAvgMap);
        actions.push({
          priority: score >= cfg.hotThreshold ? 1 : 2,
          tag: tierLabel,
          ref: mId + ' / ' + listId,
          name: buyerName,
          phone: buyerWA,
          score: score + '%',
          msg: msg,
          note: reasons
        });
      } else if (sendStat === 'تم الإرسال' && sentDate) {
        const daysSince = Math.floor((now - sentDate) / msDay);
        if (daysSince >= 2 && daysSince < 30) {
          const msg =
            `أهلاً أ/ ${buyerName} 🌟 مع حضرتك نورا من وقار للاستثمار العقاري.\n` +
            `حبيت أطمن لو حضرتك اطلعت على عرض ${type} في ${district} (${listId})، أو تحب نرشحلك اختيارات تانية قريبة في السعر أو المنطقة؟`;
          actions.push({
            priority: 3,
            tag: `📆 متابعة (${daysSince} يوم)`,
            ref: mId,
            name: buyerName,
            phone: buyerWA,
            score: score + '%',
            msg: msg,
            note: 'مر أكثر من يومين بدون تحديث الرد'
          });
        }
      }
    });
  }

  // 2) Day-7 & Day-30 Inactive Buyer Check-ins from 👥 المشترون
  const buyers = m3_getActiveBuyers_(ss);
  buyers.forEach(b => {
    const refDate = b.lastContact || b.regDate;
    if (!refDate) return;
    const days = Math.floor((now - refDate) / msDay);
    if (days >= 7) {
      const tag = days >= 30 ? '🔄 إعادة تنشيط (30+ يوم)' : '📆 متابعة أسبوعية';
      const msg =
        `السلام عليكم أ/ ${b.name} 🌟 مع حضرتك نورا من وقار للاستثمار العقاري بالإسكندرية.\n` +
        `هل ما زلت تبحث عن ${b.wantedType || 'عقار'} في ${b.preferredAreas || 'الإسكندرية'}؟ وصلتنا عروض جديدة تناسب ميزانيتك!`;
      actions.push({
        priority: days >= 30 ? 5 : 4,
        tag: tag,
        ref: b.id,
        name: b.name,
        phone: b.phone,
        score: b.status,
        msg: msg,
        note: `آخر تفاعل منذ ${days} يوم`
      });
    }
  });

  // 3) Stale Listing Seller Feedback (14+ days active with 0 interested buyers)
  activeListings.forEach(l => {
    if (!l.regDate || !l.sellerPhone) return;
    const ageDays = Math.floor((now - l.regDate) / msDay);
    const interested = interestedCountByListing[l.id] || 0;
    if (ageDays >= 14 && interested === 0) {
      const avgSqm = districtAvgMap[l.district + '|' + l.type] || 0;
      const avgHint = avgSqm > 0
        ? ` علماً بأن متوسط سعر المتر الحالي لـ ${l.type} في ${l.district} يدور حول ${avgSqm.toLocaleString('en-US')} ج/م²`
        : '';
      const msg =
        `السلام عليكم أ/ ${l.sellerName || 'الكريم'} 🌟\n` +
        `مع حضرتك نورا من وقار للاستثمار العقاري.\n` +
        `بخصوص وحدتك (${l.type} في ${l.district} — كود ${l.id}) المعروضة منذ ${ageDays} يوم، عرضناها على قاعدة مشترينا` +
        `${avgHint}.\n` +
        `هل الوحدة ما زالت متاحة، وهل يوجد مرونة في السعر أو طريقة الدفع لتنشيط المعاينات هذا الأسبوع؟`;
      actions.push({
        priority: 6,
        tag: `📉 مراجعة سعر (${ageDays} يوم)`,
        ref: l.id,
        name: l.sellerName || 'المالك',
        phone: l.sellerPhone,
        score: '0 مهتم',
        msg: msg,
        note: 'تقرير متابعة للبائع لتحديث السعر أو التوافر'
      });
    }
  });

  actions.sort((a, b) => a.priority - b.priority);

  // Render Action Queue sheet
  const headers = [
    'الأولوية / النوع', 'المرجع', 'اسم العميل', 'رقم الواتساب',
    'التقييم / الحالة', 'زر الإرسال المباشر (واتساب)', 'نص الرسالة الجاهزة', 'ملاحظات'
  ];
  qSheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#b71c1c').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  qSheet.setRowHeight(1, 45);
  qSheet.setFrozenRows(1);

  if (actions.length === 0) {
    qSheet.getRange('A2').setValue('✅ لا توجد تنبيهات أو متابعات متأخرة حالياً!');
  } else {
    const tableRows = actions.map((a, idx) => {
      const intl = m3_formatEgyptIntl_(a.phone);
      const waFormula = intl
        ? `=HYPERLINK("https://wa.me/${intl}?text="&ENCODEURL(G${idx + 2}),"📲 فتح واتساب وإرسال")`
        : 'رقم غير مسجل';
      return [a.tag, a.ref, a.name, a.phone, a.score, waFormula, a.msg, a.note];
    });
    qSheet.getRange(2, 4, tableRows.length, 1).setNumberFormat('@');
    qSheet.getRange(2, 1, tableRows.length, 8).setValues(tableRows);
  }

  [170, 120, 150, 130, 110, 170, 360, 220].forEach((w, i) => qSheet.setColumnWidth(i + 1, w));

  if (!silent) {
    m3_alert_('🔥 تحديث قائمة التنبيهات', `تم تجهيز ${actions.length} إجراء/متابعة في ورقة 🔥 تنبيهات ومتابعات.`);
  }
  return actions;
}


// ============================================================
// 8. FREE GOOGLE ALERTS RSS FETCHER (Track B Automation)
// Reads official Google Alerts Atom RSS feeds & adds to 🌐 جلب العقارات (خارجي)
// ============================================================
function m3_importGoogleAlertsRss(silent) {
  const ss = m3_ss_();
  const cfg = m3_loadConfig_(ss);
  const fetchSheet = ss.getSheetByName(M3_SHEETS.FETCH_QUEUE);
  if (!fetchSheet) return 0;

  if (!cfg.rssFeedsRaw) {
    if (!silent) {
      m3_alert_(
        'لم يتم إضافة روابط RSS بعد',
        'أضيفي روابط Google Alerts RSS في Script Properties باسم GOOGLE_ALERTS_RSS_URLS (مفصولة بفاصلة) أو راجعي ملف 02_google_alerts_rss_setup.md.'
      );
    }
    return 0;
  }

  const urls = cfg.rssFeedsRaw.split(/[\s,،]+/).filter(u => u.indexOf('http') === 0);
  const existingUrls = new Set();
  const seenPhoneDistricts = {};
  if (fetchSheet.getLastRow() >= 2) {
    fetchSheet.getRange(2, 4, fetchSheet.getLastRow() - 1, 7).getValues().forEach(r => {
      if (r[0]) existingUrls.add(String(r[0]).trim());
      const pKey = m3_digitsPhone_(r[6]).slice(-9);
      const dist = String(r[2] || '').trim();
      if (pKey && dist) {
        if (!seenPhoneDistricts[pKey]) seenPhoneDistricts[pKey] = new Set();
        seenPhoneDistricts[pKey].add(dist);
      }
    });
  }

  const addedRows = [];
  const addedBuyers = [];
  urls.forEach(feedUrl => {
    try {
      const resp = UrlFetchApp.fetch(feedUrl, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) return;

      const doc = XmlService.parse(resp.getContentText());
      const root = doc.getRootElement();
      const atomNs = XmlService.getNamespace('http://www.w3.org/2005/Atom');
      const entries = root.getChildren('entry', atomNs);

      entries.forEach(entry => {
        const titleEl = entry.getChild('title', atomNs);
        const contentEl = entry.getChild('content', atomNs);
        const linkEl = entry.getChild('link', atomNs);

        const rawLink = linkEl && linkEl.getAttribute('href') ? linkEl.getAttribute('href').getValue() : '';
        const cleanLink = m3_unwrapGoogleAlertUrl_(rawLink);
        if (!cleanLink || existingUrls.has(cleanLink)) return;
        existingUrls.add(cleanLink);

        const cleanTitle = m3_stripHtml_(titleEl ? titleEl.getText() : '');
        const cleanBody  = m3_stripHtml_(contentEl ? contentEl.getText() : '');
        const combined   = cleanTitle + '\n' + cleanBody;

        const platform = m3_detectPlatform_(cleanLink);
        const unitType = m3_detectUnitType_(combined);
        const district = m3_detectAlexDistrict_(combined);
        const phone    = m3_extractEgyptPhone_(combined);
        const area     = m3_extractArea_(combined);
        const price    = m3_extractPrice_(combined);

        // Check if this post is a BUYER REQUEST (طلب شراء / مطلوب) vs a SELLER LISTING (عرض بيع)
        if (m3_isBuyerRequestIntent_(combined)) {
          addedBuyers.push({
            platform: platform + ' (طلب مشتري)',
            name: cleanTitle.slice(0, 35) || 'مشتري خارجي',
            phone: phone || cleanLink,
            unitType: unitType,
            district: district,
            area: area || 0,
            price: price || '',
            notes: combined.slice(0, 250) + (cleanLink ? ' | ' + cleanLink : '')
          });
        } else {
          const sourceTag = m3_classifySourceIntent_(combined, phone, district, seenPhoneDistricts);
          addedRows.push({
            colsBJ: [
              new Date(), platform, cleanLink, unitType, district,
              area || '', price || '', '', phone || ''
            ],
            raw: combined.slice(0, 700),
            note: sourceTag
          });
        }
      });
    } catch (err) {
      Logger.log('RSS feed error (' + feedUrl + '): ' + err);
    }
  });

  if (addedRows.length > 0) {
    let startRow = m3_firstEmptyRow_(fetchSheet, 4);
    addedRows.forEach(item => {
      fetchSheet.getRange(startRow, 2, 1, 9).setValues([item.colsBJ]);
      fetchSheet.getRange(startRow, 12, 1, 3).setValues([[item.raw, 'لم يتم التواصل', item.note]]);
      startRow++;
    });
  }

  const buyerSheet = ss.getSheetByName(M3_SHEETS.BUYERS);
  if (buyerSheet && addedBuyers.length > 0) {
    let bRow = m3_firstEmptyRow_(buyerSheet, 5);
    addedBuyers.forEach(b => {
      buyerSheet.getRange(bRow, 2, 1, 14).setValues([[
        new Date(), b.platform, 'نشط 🔥', b.name, b.phone,
        b.unitType, b.price, 0, b.district, b.area,
        'كاش أو تقسيط', 'عاجل — أقل من شهر', '', b.notes
      ]]);
      buyerSheet.getRange(bRow, 20).setValue(new Date());
      bRow++;
    });
  }

  if (!silent) {
    const summaryMsg =
      `تم استيراد ${addedRows.length} عقار جديد في (🌐 جلب العقارات)` +
      (addedBuyers.length > 0 ? `\nوتم صيد ${addedBuyers.length} طلب مشتري جديد في (👥 المشترون)!` : '.');
    m3_alert_('🌐 استيراد من Google Alerts RSS', summaryMsg);
  }
  return addedRows.length + addedBuyers.length;
}

function m3_isBuyerRequestIntent_(text) {
  const t = String(text || '');
  const hasBuyer = /مطلوب|أبحث عن|ابحث عن|بدور على|محتاج شقة|مطلوب شراء|مطلوب أرض|مطلوب محل|عاوز شقة|عايز شقة/.test(t);
  const hasSeller = /للبيع|معروض|فرصة للبيع|متاح لدينا|شقة للبيع|محل للبيع|أرض للبيع/.test(t);
  return hasBuyer && !hasSeller;
}


// ============================================================
// 9. DAILY AUTOMATION JOB + OPTIONAL 1-TAP GMAIL DIGEST FOR NOURA
// ============================================================
function m3_dailyAutomationJob() {
  const ss = m3_ss_();
  const cfg = m3_loadConfig_(ss);

  const imported = m3_importGoogleAlertsRss(true);
  const dups     = m3_checkDuplicates(true);
  const matchRes = m3_runFullMatching(true);
  const actions  = m3_buildActionQueueSheet(true);

  if (cfg.alertEmail && actions.length > 0) {
    m3_sendHtmlDigestEmail_(cfg.alertEmail, actions, imported, dups.length, matchRes);
  }
}

function m3_sendHtmlDigestEmail_(email, actions, importedCount, dupCount, matchRes) {
  const hotAndWarm = actions.filter(a => a.priority <= 3).slice(0, 15);
  if (hotAndWarm.length === 0) return;

  const rowsHtml = hotAndWarm.map(a => {
    const intl = m3_formatEgyptIntl_(a.phone);
    const waUrl = intl ? `https://wa.me/${intl}?text=${encodeURIComponent(a.msg)}` : '#';
    return `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${a.tag}</td>
        <td style="padding:8px;border:1px solid #ddd;">${a.name}</td>
        <td style="padding:8px;border:1px solid #ddd;">${a.ref} (${a.score})</td>
        <td style="padding:8px;border:1px solid #ddd;">
          ${intl ? `<a href="${waUrl}" style="background:#25d366;color:#fff;padding:6px 12px;border-radius:6px;text-decoration:none;font-weight:bold;">إرسال واتساب</a>` : 'بدون رقم'}
        </td>
      </tr>`;
  }).join('');

  const html = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:720px;margin:auto;">
      <h2 style="color:#1a237e;">🏢 ملخص وقار للاستثمار العقاري اليومي</h2>
      <p>تطابقات جديدة: <b>${matchRes.totalNew}</b> (منها <b>${matchRes.hotNew}</b> ساخنة 🔥) | إعلانات مجلوبة: <b>${importedCount}</b> | تكرارات مكتشفة: <b>${dupCount}</b></p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#1a237e;color:#fff;">
            <th style="padding:8px;">النوع</th>
            <th style="padding:8px;">العميل</th>
            <th style="padding:8px;">المرجع والتقييم</th>
            <th style="padding:8px;">إجراء بضغطة واحدة</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

  MailApp.sendEmail({
    to: email,
    subject: `🔥 وقار للعقارات: ${matchRes.hotNew} تطابق ساخن و ${hotAndWarm.length} إجراء مطلوب`,
    htmlBody: html
  });
}


// ============================================================
// 10. INSTALLABLE TRIGGERS (Auto-match on edit + 6-hourly cron)
// ============================================================
function m3_promptSetEmail() {
  const ss = m3_ss_();
  let ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { return; }

  const current = PropertiesService.getScriptProperties().getProperty('NOURA_ALERT_EMAIL') || '';
  const resp = ui.prompt(
    '📧 إعداد بريد التنبيهات (Gmail)',
    'أدخل بريدك الإلكتروني (Gmail) لتصلك التنبيهات اليومية بضغطة واحدة:\n' +
    (current ? `(البريد الحالي: ${current})` : '(اتركه فارغاً لإلغاء التنبيهات بالبريد)'),
    ui.ButtonSet.OK_CANCEL
  );

  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const email = resp.getResponseText().trim();
  if (email && email.indexOf('@') !== -1) {
    PropertiesService.getScriptProperties().setProperty('NOURA_ALERT_EMAIL', email);
    m3_saveSettingInSheet_(ss, 'بريد التنبيهات (Gmail)', email);
    ui.alert('✅ تم الحفظ بنجاح!', 'سيصلك ملخص يومي بالتطابقات الساخنة وإجراءات المتابعة إلى:\n' + email, ui.ButtonSet.OK);
  } else if (!email) {
    PropertiesService.getScriptProperties().deleteProperty('NOURA_ALERT_EMAIL');
    m3_saveSettingInSheet_(ss, 'بريد التنبيهات (Gmail)', '');
    ui.alert('تم الإلغاء', 'تم إيقاف إرسال التنبيهات عبر البريد.', ui.ButtonSet.OK);
  } else {
    ui.alert('خطأ', 'برجاء إدخال بريد إلكتروني صحيح يحتوي على @ (مثال: noura@gmail.com)', ui.ButtonSet.OK);
  }
}

function m3_saveSettingInSheet_(ss, label, value) {
  try {
    const sheet = ss.getSheetByName(M3_SHEETS.SETTINGS);
    if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    const token = label.split(' ')[0];
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').indexOf(token) !== -1) {
        sheet.getRange(i + 1, 2).setValue(value);
        return;
      }
    }
    sheet.appendRow([label, value]);
  } catch (e) {}
}

function m3_installTriggers() {
  const ss = m3_ss_();
  const existing = ScriptApp.getProjectTriggers();

  if (!existing.some(t => t.getHandlerFunction() === 'm3_onEditTrigger')) {
    ScriptApp.newTrigger('m3_onEditTrigger').forSpreadsheet(ss).onEdit().create();
  }
  if (!existing.some(t => t.getHandlerFunction() === 'm3_dailyAutomationJob')) {
    ScriptApp.newTrigger('m3_dailyAutomationJob').timeBased().everyHours(6).create();
  }

  m3_alert_(
    '✅ تم تفعيل التشغيل التلقائي (المرحلة 3)',
    '1. أي عقار يتغير حالته إلى "تمت المراجعة" أو "منشور" سيتم مطابقته فوراً.\n' +
    '2. يعمل فحص شامل + تحديث التنبيهات تلقائياً كل 6 ساعات.'
  );
}

function m3_onEditTrigger(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.source.getActiveSheet();
    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (row < 2) return;

    // Listing status changed (col 4 = D) to تمت المراجعة or منشور
    if (sheet.getName() === M3_SHEETS.LISTINGS && col === 4) {
      const val = String(e.value || sheet.getRange(row, 4).getValue() || '');
      if (val === 'منشور' || val === 'تمت المراجعة') {
        m3_runFullMatching(true);
      }
    }
  } catch (err) {
    Logger.log('m3_onEditTrigger error: ' + err);
  }
}


// ============================================================
// 11. UTILITY HELPERS (All m3_-prefixed — zero collisions)
// ============================================================
function m3_firstEmptyRow_(sheet, checkCol) {
  const maxRow = sheet.getLastRow();
  if (maxRow < 2) return 2;
  const vals = sheet.getRange(2, checkCol, maxRow - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (!vals[i][0]) return i + 2;
  }
  return maxRow + 1;
}

function m3_digitsPhone_(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function m3_formatEgyptIntl_(phone) {
  let d = m3_digitsPhone_(phone);
  if (!d) return '';
  if (d.startsWith('0020')) d = d.slice(2);
  else if (d.startsWith('20')) { /* ok */ }
  else if (d.startsWith('0')) d = '2' + d;
  else d = '20' + d;
  return d;
}

function m3_unwrapGoogleAlertUrl_(rawUrl) {
  const m = String(rawUrl || '').match(/[?&](?:url|q)=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : rawUrl;
}

function m3_stripHtml_(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function m3_detectPlatform_(url) {
  const u = String(url || '').toLowerCase();
  if (u.indexOf('facebook.com') !== -1) return 'مجموعات فيسبوك';
  if (u.indexOf('dubizzle') !== -1 || u.indexOf('olx') !== -1) return 'OLX / دوبيزل';
  if (u.indexOf('aqarmap') !== -1) return 'عقارماب';
  if (u.indexOf('propertyfinder') !== -1) return 'بروبرتي فايندر';
  if (u.indexOf('instagram') !== -1) return 'إنستجرام';
  return 'أخرى';
}

function m3_detectUnitType_(text) {
  if (/أرض|قطعة أرض/.test(text)) return 'أرض';
  if (/محل|تجاري/.test(text)) return 'محل تجاري';
  if (/فيلا/.test(text)) return 'فيلا';
  if (/دوبلكس/.test(text)) return 'دوبلكس';
  if (/بنتهاوس/.test(text)) return 'بنتهاوس';
  if (/شاليه/.test(text)) return 'شاليه';
  return 'شقة';
}

function m3_detectAlexDistrict_(text) {
  const list = Object.keys(M3_ALEX_NEIGHBORS);
  for (let i = 0; i < list.length; i++) {
    if (text.indexOf(list[i]) !== -1) return list[i];
  }
  return 'منطقة أخرى';
}

function m3_extractEgyptPhone_(text) {
  const m = String(text || '').replace(/[\s\-()]/g, '').match(/(?:\+?20|0020|0)?(1[0125]\d{8})/);
  return m ? '0' + m[1] : '';
}

function m3_extractArea_(text) {
  const m = String(text || '').match(/(\d{2,5})\s*(?:متر|م2|م²|m2)/i);
  return m ? Number(m[1]) : '';
}

function m3_classifySourceIntent_(text, phone, district, seenPhoneDistricts) {
  const t = String(text || '');
  const pKey = m3_digitsPhone_(phone).slice(-9);
  if (pKey && seenPhoneDistricts) {
    if (!seenPhoneDistricts[pKey]) seenPhoneDistricts[pKey] = new Set();
    if (district) seenPhoneDistricts[pKey].add(district);
    if (seenPhoneDistricts[pKey].size >= 2) {
      return 'وسيط محتمل 🏢 (نفس الرقم في عدة مناطق)';
    }
  }
  if (/من المالك|المالك مباشر|بدون وسيط|بدون عمولة|للجادين من المالك/.test(t)) {
    return 'مالك محتمل 👤';
  }
  if (/شركة عقارات|مكتب عقارات|للتسويق العقاري|وسيط|سمسار|عمولة/.test(t)) {
    return 'وسيط محتمل 🏢';
  }
  return 'معلن غير محدد ❓';
}

function m3_extractPrice_(text) {
  const s = String(text || '').replace(/[,،]/g, '');
  const mil = s.match(/(\d+(?:\.\d+)?)\s*(?:مليون|million)/i);
  if (mil) return Math.round(Number(mil[1]) * 1000000);
  const big = s.match(/\b(\d{6,9})\b/);
  return big ? Number(big[1]) : '';
}


// ============================================================
// 12. SELF-TEST HARNESS (Run in Apps Script or Node Mock)
// ============================================================
function m3_testMatchingEngine() {
  const cfg = {
    hotThreshold: 85, warmThreshold: 60,
    wBudget: 35, wLocation: 30, wTypeSize: 20, wPayment: 10, wMustHaves: 5,
    tiers: { 'سموحة': 'Prime', 'سيدي جابر': 'Prime', 'ميامي': 'Mid' }
  };

  const listing = {
    id: 'WQ-001', type: 'شقة', district: 'سموحة', street: 'فوزي معاذ', floor: 3,
    area: 165, finishing: 'تشطيب سوبر لوكس', features: 'أسانسير، جراج', legalStatus: 'ملكية تامة',
    price: 3800000, pricePerSqm: 23030, payment: 'كاش', negotiable: 'نعم', rawDesc: ''
  };
  const highNoLift = {
    id: 'WQ-002', type: 'شقة', district: 'سموحة', street: 'شارع النقل والهندسة', floor: 7,
    area: 160, finishing: 'تشطيب لوكس', features: 'غاز، مياه', legalStatus: 'ملكية تامة',
    price: 3100000, pricePerSqm: 19375, payment: 'كاش', negotiable: 'نعم', rawDesc: ''
  };
  const noPriceDraft = {
    id: 'WQ-003', type: 'شقة', district: 'سموحة', street: 'فوزي معاذ', floor: 2,
    area: 165, finishing: 'تشطيب سوبر لوكس', features: 'أسانسير', legalStatus: 'ملكية تامة',
    price: 0, pricePerSqm: 0, payment: 'كاش', negotiable: 'لا', rawDesc: ''
  };
  const exactBuyer = {
    id: 'BYR-001', name: 'أحمد', wantedType: 'شقة', budgetMin: 2000000, budgetMax: 4000000,
    preferredAreas: 'سموحة، كفر عبده', minArea: 140, payment: 'كاش فقط', mustHaves: 'أسانسير'
  };
  const neighborBuyer = {
    id: 'BYR-002', name: 'نهى', wantedType: 'شقة', budgetMin: 2000000, budgetMax: 3600000,
    preferredAreas: 'سيدي جابر', minArea: 150, payment: 'كاش أو تقسيط', mustHaves: 'ما عنديش شروط محددة'
  };
  const landBuyer = {
    id: 'BYR-003', name: 'طارق', wantedType: 'أرض', budgetMin: 2000000, budgetMax: 6000000,
    preferredAreas: 'سموحة', minArea: 150, payment: 'كاش فقط', mustHaves: ''
  };

  const r1 = m3_scorePair_(listing, exactBuyer, cfg);
  const r2 = m3_scorePair_(listing, neighborBuyer, cfg);
  const r3 = m3_scorePair_(listing, landBuyer, cfg);
  const r4 = m3_scorePair_(highNoLift, exactBuyer, cfg);
  const r5 = m3_scorePair_(noPriceDraft, exactBuyer, cfg);

  Logger.log('Exact Buyer Score: ' + r1.score + '% (' + r1.category + ') | ' + r1.reasons.join(', '));
  Logger.log('Neighbor Buyer Score: ' + r2.score + '% (' + r2.category + ') | ' + r2.reasons.join(', '));
  Logger.log('Land Buyer Score (should be 0): ' + r3.score + '% | ' + r3.rejected);
  Logger.log('High Floor No Elevator (should be 0): ' + r4.score + '% | ' + r4.rejected);
  Logger.log('Missing Price Draft (should be < warm): ' + r5.score + '% | ' + r5.reasons.join(', '));
  return { r1, r2, r3, r4, r5 };
}
