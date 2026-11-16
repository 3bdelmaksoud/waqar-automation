/**
 * ============================================================
 *  WAQAR REAL ESTATE — Autonomous Sourcing & Matching Crawler
 *  وقار للاستثمار العقاري — زاحف الجمع الآلي للعقارات وطلبات المشترين
 * ============================================================
 *  100% Hands-Free Autonomous Crawler.
 *  - Discovers property listings (Apartments, Lands, Stores) in Alexandria.
 *  - Discovers active buyer demands ("مطلوب شقة", "مطلوب أرض", etc.).
 *  - Normalizes Egyptian phone numbers, prices, areas, and districts.
 *  - Deduplicates and pushes directly to Waqar Apps Script Webhook.
 *  - Automatically triggers the Alexandria Real Estate Matching Engine!
 *
 *  USAGE:
 *    1. Run once:
 *       node auto_crawler.js --url "https://script.google.com/macros/s/YOUR_EXEC_ID/exec"
 *
 *    2. Continuous background watch (every 60 minutes):
 *       node auto_crawler.js --url "YOUR_URL" --watch --interval 60
 *
 *    3. Free Cloud Cron:
 *       Runs via GitHub Actions (see .github/workflows/waqar_crawler.yml)
 * ============================================================
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const urlModule = require('url');

// 1. ALEXANDRIA KNOWLEDGE GRAPH & DICTIONARIES
const ALEX_DISTRICTS = [
  'سموحة', 'كفر عبده', 'روشدي', 'رشدي', 'سان ستيفانو', 'سبورتنج', 'ستانلي',
  'جليم', 'زيزينيا', 'سيدي جابر', 'لوران', 'فيكتوريا', 'ميامي', 'سيدي بشر',
  'المندرة', 'كليوباترا', 'الإبراهيمية', 'محرم بك', 'المنتزه', 'المعمورة',
  'أبو قير', 'العجمي', 'الهانوفيل', 'البيطاش', 'برج العرب', 'الدخيلة',
  'العامرية', 'وسط البلد', 'بحري', 'الشاطبي', 'كامب شيزار', 'السيوف', 'العوايد',
  'العصافرة', 'فليمنج', 'باكوس', 'الورديان', 'بولكلي'
];

const BUYER_INTENT_KEYWORDS = [
  'مطلوب', 'مطلوب شقة', 'مطلوب ارض', 'مطلوب أرض', 'مطلوب محل', 'مطلوب صيدلية',
  'أبحث عن', 'ابحث عن', 'عاوز شقة', 'عايز شقة', 'محتاج شقة', 'مطلوب للشراء',
  'ابحث عن شقة', 'مطلوب فوراً', 'مطلوب فورا', 'مطلوب في حدود', 'حد عنده شقة'
];

const SELLER_INTENT_KEYWORDS = [
  'للبيع', 'شقة للبيع', 'أرض للبيع', 'ارض للبيع', 'محل للبيع', 'معروض للبيع',
  'فرصة للبيع', 'متاح للبيع', 'للبيع بالاسكندرية', 'للبيع بالإسكندرية', 'كود العقار'
];

// 2. PARSING & EXTRACTION HELPERS
function extractPhoneNumbers(text) {
  if (!text) return [];
  const clean = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // Matches Egyptian mobile prefixes: 010, 011, 012, 015
  const matches = clean.match(/(?:(?:\+?20|0020)?0)?(1[0125]\d{8})\b/g) || [];
  const unique = [];
  matches.forEach(m => {
    let digits = m.replace(/[^0-9]/g, '');
    if (digits.startsWith('20')) digits = digits.slice(2);
    if (!digits.startsWith('0') && digits.length === 10) digits = '0' + digits;
    if (digits.length === 11 && !unique.includes(digits)) {
      unique.push(digits);
    }
  });
  return unique;
}

function extractAlexandriaDistrict(text) {
  if (!text) return 'الإسكندرية';
  for (const d of ALEX_DISTRICTS) {
    const rx = new RegExp(`(^|[^\\p{L}])${d}([^\\p{L}]|$)`, 'u');
    if (rx.test(text)) return d;
  }
  return 'الإسكندرية';
}

function extractUnitType(text) {
  if (!text) return 'شقة';
  if (/أرض|ارض|قطعة أرض|أراضي/u.test(text)) return 'أرض';
  if (/محل|محل تجاري|مقر إداري|مكتب|مخزن|معرض|صيدلية/u.test(text)) return 'محل';
  if (/فيلا|تاون هاوس|توين هاوس|قصر/u.test(text)) return 'فيلا';
  if (/دوبلكس/u.test(text)) return 'دوبلكس';
  if (/شاليه/u.test(text)) return 'شاليه';
  return 'شقة';
}

function extractPriceOrBudget(text) {
  if (!text) return 0;
  // Match "3.5 مليون" or "3 مليون و 200 الف" or "850 الف" or "3,500,000"
  const millionMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:مليون|م)/);
  if (millionMatch) {
    const val = parseFloat(millionMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0 && val < 500) return Math.round(val * 1000000);
  }

  const thousandMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:ألف|الف|k)/i);
  if (thousandMatch) {
    const val = parseFloat(thousandMatch[1].replace(',', '.'));
    if (!isNaN(val) && val >= 50 && val <= 50000) return Math.round(val * 1000);
  }

  const rawNumMatch = text.match(/(?:سعر|ميزانية|بمبلغ|في حدود|حدود)\s*[:=]?\s*([0-9,]{6,10})/);
  if (rawNumMatch) {
    const num = parseInt(rawNumMatch[1].replace(/,/g, ''), 10);
    if (!isNaN(num) && num >= 100000 && num <= 200000000) return num;
  }

  return 0;
}

function extractArea(text) {
  if (!text) return 0;
  const match = text.match(/(\d{2,4})\s*(?:متر|م²|م2|م\b)/);
  if (match) {
    const val = parseInt(match[1], 10);
    if (val >= 20 && val <= 10000) return val;
  }
  return 0;
}

function isBuyerIntent(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  for (const kw of BUYER_INTENT_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

// 3. HTTP FETCH HELPER (Handles HTTP/HTTPS redirects and timeouts)
function fetchText(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${targetUrl}`));
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const reqHeaders = Object.assign({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1'
    }, headers);

    const req = lib.get(targetUrl, { headers: reqHeaders, timeout: 15000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, targetUrl).href;
        }
        return fetchText(redirectUrl, headers).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${targetUrl}`)); });
  });
}

function postJson(targetUrl, payload) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${targetUrl}`));
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify(payload);

    const req = lib.request(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
        'User-Agent': 'WaqarCrawler/1.0 (+https://facebook.com/Waqar.Realestatee)'
      },
      timeout: 30000
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(txt => {
          try { resolve(JSON.parse(txt)); } catch (e) { resolve({ raw: txt }); }
        }).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout posting to ${targetUrl}`)); });
    req.write(bodyStr, 'utf8');
    req.end();
  });
}

// 4. SCRAPING CHANNELS
/**
 * Scrapes Google Alerts RSS feeds for Alexandria Real Estate.
 * Google Alerts delivers live indexed postings for both properties and buyer requests.
 */
async function scrapeGoogleAlertsRss(rssUrls) {
  const discovered = { listings: [], buyers: [] };
  for (const feedUrl of rssUrls) {
    if (!feedUrl || !feedUrl.startsWith('http')) continue;
    try {
      const xml = await fetchText(feedUrl);
      const entryRegex = /<entry>([\s\S]*?)<\/entry>|<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = entryRegex.exec(xml)) !== null) {
        const itemBlock = match[1] || match[2];
        const titleMatch = itemBlock.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const linkMatch  = itemBlock.match(/href="([^"]+)"|<link>([^<]+)<\/link>/i);
        const descMatch  = itemBlock.match(/<content[^>]*>([\s\S]*?)<\/content>|<description>([\s\S]*?)<\/description>/i);

        const cleanHtml = str => (str || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
        const rawTitle = cleanHtml(titleMatch ? titleMatch[1] : '');
        let link = linkMatch ? (linkMatch[1] || linkMatch[2]) : '';
        const rawDesc = cleanHtml(descMatch ? descMatch[1] : '');
        const fullText = (rawTitle + ' ' + rawDesc).trim();

        // Extract actual URL if wrapped in Google redirect
        const urlParamMatch = link.match(/url=([^&]+)/);
        if (urlParamMatch) link = decodeURIComponent(urlParamMatch[1]);

        if (!fullText || fullText.length < 15) continue;

        const phones = extractPhoneNumbers(fullText);
        const phone = phones.length > 0 ? phones[0] : '';
        const district = extractAlexandriaDistrict(fullText);
        const type = extractUnitType(fullText);
        const price = extractPriceOrBudget(fullText);
        const area = extractArea(fullText);

        if (isBuyerIntent(fullText)) {
          discovered.buyers.push({
            source: 'Google Alerts (طلب مشتري)',
            name: 'مشتري نشط',
            phone: phone || link,
            wanted_type: type,
            budget_max: price,
            preferred_districts: district,
            min_area: area,
            notes: 'طلب مجلوب تلقائياً عبر التنبيهات 🤖',
            raw_text: fullText
          });
        } else {
          discovered.listings.push({
            platform: 'تنبيهات جوجل / الويب',
            url: link,
            type: type,
            district: district,
            area: area,
            price: price,
            seller_name: 'معلن ويب',
            seller_phone: phone,
            raw_text: fullText,
            notes: 'عقار مجلوب تلقائياً 🤖'
          });
        }
      }
    } catch (err) {
      console.warn(`[WARN] RSS fetch error (${feedUrl}):`, err.message);
    }
  }
  return discovered;
}

/**
 * Scrapes Dubizzle (OLX) Alexandria open listing & search pages.
 */
async function scrapeDubizzleAlexandria() {
  const discovered = { listings: [], buyers: [] };
  const targetEndpoints = [
    // 1. Properties for sale
    { url: 'https://www.dubizzle.com.eg/properties/apartments-duplex-for-sale/alexandria/', type: 'شقة', isBuyer: false },
    { url: 'https://www.dubizzle.com.eg/properties/land-for-sale/alexandria/', type: 'أرض', isBuyer: false },
    { url: 'https://www.dubizzle.com.eg/properties/commercial-for-sale/alexandria/', type: 'محل', isBuyer: false },
    // 2. Buyer demands ("مطلوب")
    { url: 'https://www.dubizzle.com.eg/properties/apartments-duplex-for-sale/alexandria/?q=%D9%85%D8%B7%D9%84%D9%88%D8%A8', type: 'شقة', isBuyer: true },
    { url: 'https://www.dubizzle.com.eg/properties/land-for-sale/alexandria/?q=%D9%85%D8%B7%D9%84%D9%88%D8%A8', type: 'أرض', isBuyer: true }
  ];

  for (const ep of targetEndpoints) {
    try {
      const html = await fetchText(ep.url);
      // Dubizzle renders initial JSON in script tags (__NEXT_DATA__)
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (nextDataMatch) {
        const json = JSON.parse(nextDataMatch[1]);
        const ads = (json.props && json.props.pageProps && json.props.pageProps.ads) || [];
        ads.forEach(ad => {
          const title = ad.title || '';
          const desc = ad.description || '';
          const combined = title + ' ' + desc;
          const price = (ad.price && ad.price.value) ? Number(ad.price.value) : extractPriceOrBudget(combined);
          const location = (ad.location && ad.location.name) || extractAlexandriaDistrict(combined);
          const adUrl = ad.canonical_url ? ('https://www.dubizzle.com.eg' + ad.canonical_url) : ep.url;
          const phones = extractPhoneNumbers(combined);
          const phone = phones.length > 0 ? phones[0] : (ad.user_id ? String(ad.user_id) : '');
          const area = extractArea(combined);

          if (ep.isBuyer || isBuyerIntent(combined)) {
            discovered.buyers.push({
              source: 'دوبيزل (مطلوب)',
              name: ad.user_name || 'مشتري دوبيزل',
              phone: phone || adUrl,
              wanted_type: ep.type,
              budget_max: price,
              preferred_districts: location,
              min_area: area,
              notes: 'طلب مجلوب من دوبيزل 🤖',
              raw_text: combined.slice(0, 500)
            });
          } else {
            discovered.listings.push({
              platform: 'OLX / دوبيزل',
              url: adUrl,
              type: ep.type,
              district: location,
              area: area,
              price: price,
              seller_name: ad.user_name || 'معلن دوبيزل',
              seller_phone: phone,
              raw_text: combined.slice(0, 1000),
              notes: 'جلب آلي من دوبيزل 🤖'
            });
          }
        });
      }
    } catch (err) {
      console.warn(`[WARN] Dubizzle crawl note (${ep.url}):`, err.message);
    }
  }
  return discovered;
}

/**
 * Cloud integration with Apify Facebook Groups Scraper (Optional).
 * When APIFY_TOKEN is supplied, pulls recent posts from Alexandria Facebook Groups.
 */
async function scrapeApifyFacebookGroups(apifyToken, datasetId) {
  const discovered = { listings: [], buyers: [] };
  if (!apifyToken || !datasetId) return discovered;

  try {
    const apifyUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&format=json&limit=100`;
    const itemsRaw = await fetchText(apifyUrl);
    const items = JSON.parse(itemsRaw);

    items.forEach(item => {
      const text = item.text || item.postText || item.message || '';
      const postUrl = item.postUrl || item.url || '';
      const author = item.authorName || item.user || 'عضو فيسبوك';
      const phones = extractPhoneNumbers(text);
      const phone = phones.length > 0 ? phones[0] : (item.authorId ? `https://facebook.com/${item.authorId}` : postUrl);
      const district = extractAlexandriaDistrict(text);
      const type = extractUnitType(text);
      const price = extractPriceOrBudget(text);
      const area = extractArea(text);

      if (isBuyerIntent(text)) {
        discovered.buyers.push({
          source: 'جروبات فيسبوك (طلب مشتري)',
          name: author,
          phone: phone,
          wanted_type: type,
          budget_max: price,
          preferred_districts: district,
          min_area: area,
          notes: 'طلب مشتري مجلوب عبر سحابة فيسبوك 🤖',
          raw_text: text.slice(0, 800)
        });
      } else {
        discovered.listings.push({
          platform: 'مجموعات فيسبوك',
          url: postUrl,
          type: type,
          district: district,
          area: area,
          price: price,
          seller_name: author,
          seller_phone: phone,
          raw_text: text.slice(0, 1000),
          notes: 'عقار مجلوب عبر سحابة فيسبوك 🤖'
        });
      }
    });
  } catch (err) {
    console.warn('[WARN] Apify Facebook crawl error:', err.message);
  }
  return discovered;
}

// 5. MAIN ORCHESTRATOR & CLI ENGINE
async function runAutomationCycle(config) {
  console.log('\n============================================================');
  console.log('🚀 WAQAR AUTOMATION CRAWLER — STARTING DISCOVERY CYCLE');
  console.log(`⏰ Time: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`);
  console.log('============================================================\n');

  const allDiscovered = { listings: [], buyers: [] };

  // 1. Crawl Dubizzle Alexandria
  console.log('🔍 [1/3] Scanning Dubizzle Alexandria for Properties & Buyer Demands...');
  const dubizzle = await scrapeDubizzleAlexandria();
  allDiscovered.listings.push(...dubizzle.listings);
  allDiscovered.buyers.push(...dubizzle.buyers);
  console.log(`   ↳ Found: ${dubizzle.listings.length} properties, ${dubizzle.buyers.length} buyer requests.`);

  // 2. Crawl Google Alerts RSS Feeds
  if (config.rssFeeds && config.rssFeeds.length > 0) {
    console.log('🔍 [2/3] Checking Google Alerts Real Estate RSS feeds...');
    const rss = await scrapeGoogleAlertsRss(config.rssFeeds);
    allDiscovered.listings.push(...rss.listings);
    allDiscovered.buyers.push(...rss.buyers);
    console.log(`   ↳ Found: ${rss.listings.length} properties, ${rss.buyers.length} buyer requests.`);
  } else {
    console.log('ℹ️  [2/3] Google Alerts RSS skipped (none configured).');
  }

  // 3. Optional Apify Facebook Scraper
  if (config.apifyToken && config.apifyDatasetId) {
    console.log('🔍 [3/3] Pulling Facebook Groups posts from Apify Cloud...');
    const fb = await scrapeApifyFacebookGroups(config.apifyToken, config.apifyDatasetId);
    allDiscovered.listings.push(...fb.listings);
    allDiscovered.buyers.push(...fb.buyers);
    console.log(`   ↳ Found: ${fb.listings.length} properties, ${fb.buyers.length} buyer requests.`);
  } else {
    console.log('ℹ️  [3/3] Apify Cloud Facebook sync skipped (token not set).');
  }

  console.log('\n📊 SOURCING SUMMARY:');
  console.log(`   Total Discovered Properties:   ${allDiscovered.listings.length}`);
  console.log(`   Total Discovered Buyer Demands: ${allDiscovered.buyers.length}`);

  if (allDiscovered.listings.length === 0 && allDiscovered.buyers.length === 0) {
    console.log('✅ Cycle finished. No new postings to push.');
    return;
  }

  // 4. Push to Waqar Apps Script Webhook
  if (!config.webhookUrl) {
    console.log('\n⚠️  No --url provided. Printing sample extracted payload:');
    console.log(JSON.stringify(allDiscovered, null, 2).slice(0, 1000) + '...');
    return;
  }

  console.log(`\n📤 Pushing to Waqar Webhook (${config.webhookUrl})...`);
  try {
    const payload = {
      action: 'ingest',
      secret: config.secret || '',
      trigger_matching: true,
      listings: allDiscovered.listings,
      buyers: allDiscovered.buyers
    };
    const res = await postJson(config.webhookUrl, payload);
    console.log('\n🎯 INGESTION & MATCHING RESPONSE:');
    console.log(JSON.stringify(res, null, 2));

    if (res.status === 'success') {
      console.log('\n✨ SUCCESS!');
      console.log(`   ✅ New Properties Ingested: ${res.inserted_listings} (${res.skipped_duplicate_listings} duplicates skipped)`);
      console.log(`   ✅ New Buyers Ingested:     ${res.inserted_buyers} (${res.skipped_duplicate_buyers} duplicates skipped)`);
      if (res.matching_result) {
        console.log(`   🔥 New Hot Matches Alerted: ${res.matching_result.hotNew || 0}`);
      }
    }
  } catch (postErr) {
    console.error('❌ Failed to push to webhook:', postErr.message);
  }
}

// 6. CLI ARGUMENT PARSER
function parseArgs() {
  const args = process.argv.slice(2);
  const cfg = {
    webhookUrl: process.env.WAQAR_WEBHOOK_URL || '',
    secret: process.env.WAQAR_INGEST_SECRET || '',
    apifyToken: process.env.APIFY_TOKEN || '',
    apifyDatasetId: process.env.APIFY_DATASET_ID || '',
    rssFeeds: process.env.WAQAR_RSS_FEEDS ? process.env.WAQAR_RSS_FEEDS.split(',') : [],
    watch: false,
    intervalMinutes: 60
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--url' || a === '-u') && args[i + 1]) cfg.webhookUrl = args[++i];
    else if (a === '--secret' && args[i + 1]) cfg.secret = args[++i];
    else if (a === '--apify-token' && args[i + 1]) cfg.apifyToken = args[++i];
    else if (a === '--apify-dataset' && args[i + 1]) cfg.apifyDatasetId = args[++i];
    else if (a === '--rss' && args[i + 1]) cfg.rssFeeds.push(args[++i]);
    else if (a === '--watch' || a === '-w') cfg.watch = true;
    else if ((a === '--interval' || a === '-i') && args[i + 1]) cfg.intervalMinutes = Math.max(5, parseInt(args[++i], 10));
  }
  return cfg;
}

// 7. ENTRYPOINT
(async () => {
  const config = parseArgs();
  await runAutomationCycle(config);

  if (config.watch) {
    console.log(`\n⏳ Watch mode active. Next scan scheduled in ${config.intervalMinutes} minutes.`);
    setInterval(async () => {
      try {
        await runAutomationCycle(config);
      } catch (err) {
        console.error('❌ Unhandled error in watch cycle:', err);
      }
    }, config.intervalMinutes * 60 * 1000);
  }
})();
