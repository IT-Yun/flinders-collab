const { supabaseAdmin } = require('../services/supabase');

const WP_EVENTS_URL = 'https://events.flinders.edu.au/wp-json/wp/v2/ajde_events?per_page=50';
const EVENT_FETCH_TIMEOUT_MS = 10000;
const EVENT_INTERVAL_MS = 30 * 60 * 1000;
const WEEKDAY_PATTERN = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
const MONTH_PATTERN = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
let isEventCrawlRunning = false;

async function fetchWithTimeout(url, timeoutMs = EVENT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const categoryPatterns = {
  'IT & Computing': [/\bcomputer\b/i, /\bI\.?T\.?\b/, /\btech\b/i, /\btechnolog/i, /\bsoftware\b/i, /\bcyber/i, /\bdata\b/i, /\bdigital\b/i, /\b(?:A\.?I\.?|artificial intelligence)\b/i, /\bmachine learning\b/i, /\bcoding\b/i, /\bprogramming\b/i, /\bhackathon\b/i, /\binformation technology\b/i, /\bSTEM\b/],
  'Engineering': [/\bengineering\b/i, /\bmechanical\b/i, /\bcivil\b/i, /\belectrical\b/i, /\brobotic/i, /\bmaritime\b/i],
  'Health & Medicine': [/\bhealth\b/i, /\bmedicin/i, /\bnursing\b/i, /\bmedical\b/i, /\bclinical\b/i, /\bnutrition/i, /\bparamedic/i, /\bphysiotherap/i, /\bwellbeing\b/i, /\bmental health\b/i],
  'Business & Law': [/\bbusiness\b/i, /\b(?:^|\s)law(?:\s|$)/i, /\baccounting\b/i, /\bfinance\b/i, /\bcommerce\b/i, /\bMBA\b/, /\bentrepreneurship\b/i, /\bcorporate\b/i, /\benterprise\b/i, /\bstartup\b/i],
  'Education': [/\beducation\b/i, /\bteaching\b/i, /\bteacher\b/i, /\bSTEM education\b/i, /\bliteracy\b/i, /\blearning\b/i, /\bstudy skills\b/i],
  'Arts & Creative': [/\bcreative arts?\b/i, /\bdesign\b/i, /\bfilm\b/i, /\bfashion\b/i, /\bperformance\b/i, /\bvisual art/i, /\bmusic\b/i, /\bcostume\b/i, /\btheatre\b/i, /\bdrama\b/i, /\bexhibition\b/i, /\bmuseum\b/i],
  'Science': [/\bscience\b/i, /\bbiology\b/i, /\bchemistry\b/i, /\bmarine\b/i, /\benvironmental\b/i, /\bforensic\b/i, /\bbiodiversity\b/i],
  'Career': [/\bcareer/i, /\bemployment\b/i, /\bjob\b/i, /\binternship/i, /\bresume\b/i, /\bnetworking\b/i, /\bprofessional development\b/i, /\bwork placement\b/i, /\bcareer expo\b/i, /\bcareer fair\b/i, /\brecruit/i, /\bgraduate program/i, /\bgraduate role/i, /\bemployer/i, /\bindustry\b/i, /\bcareer pathway/i, /\bfuture career/i, /\bexpo-style\b/i, /\bopportunit(?:y|ies)\b/i],
};

const categoryPriority = [
  'Career',
  'IT & Computing',
  'Engineering',
  'Health & Medicine',
  'Business & Law',
  'Education',
  'Arts & Creative',
  'Science',
];

function stripHtmlTags(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/&#\d+;/g, ' ').replace(/&\w+;/g, ' ').trim();
}

function categorizeEvent(title, excerpt = '', content = '') {
  const titleText = stripHtmlTags(title);
  const excerptText = stripHtmlTags(excerpt);
  const contentText = stripHtmlTags(content);
  const fullText = `${titleText} ${excerptText} ${contentText}`.trim();
  const titleAndExcerpt = `${titleText} ${excerptText}`.trim();

  const scores = new Map();

  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    let score = 0;
    for (const re of patterns) {
      if (re.test(titleText)) score += 4;
      else if (re.test(titleAndExcerpt)) score += 2;
      else if (re.test(fullText)) score += 1;
    }
    if (score > 0) {
      scores.set(category, score);
    }
  }

  if (/\btaster day\b/i.test(fullText)) {
    if (/\bbusiness\b|\blaw\b|\bcommerce\b|\bfinance\b/i.test(fullText)) {
      scores.set('Business & Law', Math.max(scores.get('Business & Law') || 0, 3));
    }
    if (/\bfashion\b|\bcostume\b|\bart\b|\bdesign\b/i.test(fullText)) {
      scores.set('Arts & Creative', Math.max(scores.get('Arts & Creative') || 0, 3));
    }
    if (/\bengineering\b|\brobotics?\b|\bmechanical\b|\bcivil\b|\belectrical\b/i.test(fullText)) {
      scores.set('Engineering', Math.max(scores.get('Engineering') || 0, 3));
    }
  }

  if (
    /\bcareer/i.test(fullText)
    || /\bemployer/i.test(fullText)
    || /\binternship/i.test(fullText)
    || /\bgraduate\b/i.test(fullText)
    || /\bnetworking\b/i.test(fullText)
    || /\brecruit/i.test(fullText)
    || /\bexpo\b/i.test(fullText)
    || /\bfestival\b/i.test(fullText)
  ) {
    scores.set('Career', Math.max(scores.get('Career') || 0, 3));
  }

  const matched = categoryPriority
    .filter((category) => (scores.get(category) || 0) > 0)
    .sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0) || categoryPriority.indexOf(a) - categoryPriority.indexOf(b));

  return matched.length > 0 ? matched : ['General'];
}

const MONTHS = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };

function parseTime(timeStr) {
  if (!timeStr) return null;
  const normalized = String(timeStr).trim().replace(/\.(\d{2})/g, ':$1');
  const m = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2] || '0');
  if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12;
  if (m[3].toLowerCase() === 'am' && h === 12) h = 0;
  return { h, m: min };
}

function extractEventJsonLd(html) {
  const matches = [...html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const match of matches) {
    try {
      const payload = JSON.parse(match[1]);
      if (payload['@graph'] && Array.isArray(payload['@graph'])) {
        const event = payload['@graph'].find((entry) => entry['@type'] === 'Event');
        if (event) return event;
      }
      if (Array.isArray(payload)) {
        const event = payload.find((entry) => entry?.['@type'] === 'Event');
        if (event) return event;
      }
      if (payload?.['@type'] === 'Event') {
        return payload;
      }
    } catch {
      // Ignore malformed JSON-LD blocks and continue searching.
    }
  }

  return null;
}

function extractSchemaMetaValue(html, itemprop) {
  const regex = new RegExp(`<meta[^>]*itemprop=['"]${itemprop}['"][^>]*content=['"]([^'"]+)['"][^>]*>`, 'i');
  return html.match(regex)?.[1] || null;
}

function extractSchemaLocation(html) {
  const match = html.match(/<span[^>]*itemprop=['"]name['"][^>]*>([^<]+)<\/span>/i);
  return match ? stripHtmlTags(match[1]) : '';
}

function parseEventDateFromContent(contentHtml) {
  if (!contentHtml) return null;
  const text = stripHtmlTags(contentHtml);
  const datePrefix = `(?:Date:\\s*)?(?:${WEEKDAY_PATTERN}\\s+)?`;

  // Both times have am/pm
  const bothAmPm = text.match(
    new RegExp(`${datePrefix}(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4}),?[\\s\\S]{0,40}?(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm))\\s*[–\\-]\\s*(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm))`, 'i')
  );
  if (bothAmPm) {
    const day = parseInt(bothAmPm[1]);
    const month = MONTHS[bothAmPm[2].toLowerCase()];
    const year = parseInt(bothAmPm[3]);
    const st = parseTime(bothAmPm[4]);
    const et = parseTime(bothAmPm[5]);
    return {
      start_time: new Date(year, month, day, st?.h || 0, st?.m || 0).toISOString(),
      end_time: et ? new Date(year, month, day, et.h, et.m).toISOString() : null,
      time_display: `${bothAmPm[4].trim()} – ${bothAmPm[5].trim()}`,
    };
  }

  // Only end time has am/pm — "12:15 – 1:00 pm"
  const endOnlyAmPm = text.match(
    new RegExp(`${datePrefix}(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4}),?[\\s\\S]{0,40}?(\\d{1,2}(?:[:.]\\d{2})?)\\s*[–\\-]\\s*(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm))`, 'i')
  );
  if (endOnlyAmPm) {
    const day = parseInt(endOnlyAmPm[1]);
    const month = MONTHS[endOnlyAmPm[2].toLowerCase()];
    const year = parseInt(endOnlyAmPm[3]);
    const et = parseTime(endOnlyAmPm[5]);
    const startRaw = endOnlyAmPm[4].trim();
    const endAmPm = endOnlyAmPm[5].match(/(am|pm)/i)?.[1] || 'am';
    const st = parseTime(startRaw + endAmPm);
    return {
      start_time: new Date(year, month, day, st?.h || 0, st?.m || 0).toISOString(),
      end_time: et ? new Date(year, month, day, et.h, et.m).toISOString() : null,
      time_display: `${startRaw} – ${endOnlyAmPm[5].trim()}`,
    };
  }

  // Single time
  const singleTime = text.match(
    new RegExp(`${datePrefix}(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4}),?[\\s\\S]{0,40}?(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm))`, 'i')
  );
  if (singleTime) {
    const day = parseInt(singleTime[1]);
    const month = MONTHS[singleTime[2].toLowerCase()];
    const year = parseInt(singleTime[3]);
    const st = parseTime(singleTime[4]);
    return {
      start_time: new Date(year, month, day, st?.h || 0, st?.m || 0).toISOString(),
      end_time: null,
      time_display: singleTime[4].trim(),
    };
  }

  // Date only
  const dateOnly = text.match(
    new RegExp(`${datePrefix}(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4})`, 'i')
  );
  if (dateOnly) {
    const day = parseInt(dateOnly[1]);
    const month = MONTHS[dateOnly[2].toLowerCase()];
    const year = parseInt(dateOnly[3]);
    return {
      start_time: new Date(year, month, day, 9, 0).toISOString(),
      end_time: null,
      time_display: '',
    };
  }

  return null;
}

function parseLocationFromClassList(classList) {
  if (!Array.isArray(classList)) return '';
  const locClass = classList.find((c) => c.startsWith('event_location-'));
  if (!locClass) return '';
  return locClass
    .replace('event_location-', '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/(\s)(Level)(\s)/g, ' | Level ')
    .replace(/(\s)(Room)(\s)/g, ' | Room ')
    .replace(/(\s)(Building)(\s)/g, ' | Building ');
}

function parseLocationFromContent(contentHtml) {
  if (!contentHtml) return '';
  const boldBlocks = contentHtml.match(/<strong>([^<]+)<\/strong>/gi) || [];
  for (const block of boldBlocks) {
    const text = stripHtmlTags(block);
    if (/\d{4}/.test(text) && /(?:am|pm)/i.test(text)) continue;
    if (/(?:Campus|Room|Building|Hall|Library|Theatre|Online|Level)/i.test(text)) {
      return text;
    }
  }
  return '';
}

/**
 * Fetch individual event page and parse JSON-LD schema for date/time/location.
 * Used as fallback when content.rendered is empty.
 */
async function fetchEventPageSchema(eventUrl) {
  if (!eventUrl) return null;
  try {
    const res = await fetchWithTimeout(eventUrl);
    if (!res.ok) return null;
    const html = await res.text();
    const result = {};
    const event = extractEventJsonLd(html);

    // Parse startDate like "2026-4-1T11:00+10.5:00"
    if (event?.startDate) {
      const sd = parseSchemaDate(event.startDate);
      if (sd) result.start_time = sd.toISOString();
    }
    if (event?.endDate) {
      const ed = parseSchemaDate(event.endDate);
      if (ed) result.end_time = ed.toISOString();
    }

    // Build time_display from start/end
    if (result.start_time) {
      const s = new Date(result.start_time);
      const startStr = formatTimeAmPm(s);
      if (result.end_time) {
        const e = new Date(result.end_time);
        result.time_display = `${startStr} – ${formatTimeAmPm(e)}`;
      } else {
        result.time_display = startStr;
      }
    }

    // Parse location
    if (event?.location) {
      const loc = Array.isArray(event.location) ? event.location[0] : event.location;
      if (loc?.name) result.location = loc.name;
    }

    if (!result.start_time) {
      const metaStart = extractSchemaMetaValue(html, 'startDate');
      const sd = parseSchemaDate(metaStart);
      if (sd) result.start_time = sd.toISOString();
    }
    if (!result.end_time) {
      const metaEnd = extractSchemaMetaValue(html, 'endDate');
      const ed = parseSchemaDate(metaEnd);
      if (ed) result.end_time = ed.toISOString();
    }
    if (!result.location) {
      result.location = extractSchemaLocation(html) || '';
    }
    if (!result.time_display && result.start_time) {
      const s = new Date(result.start_time);
      result.time_display = result.end_time
        ? `${formatTimeAmPm(s)} – ${formatTimeAmPm(new Date(result.end_time))}`
        : formatTimeAmPm(s);
    }

    // Parse cost/registration info
    if (event?.offers) {
      const offer = Array.isArray(event.offers) ? event.offers[0] : event.offers;
      if (offer?.price === 0 || offer?.price === '0') result.cost = 'Free';
      else if (offer?.price) result.cost = `$${offer.price}`;
    }
    const lowerHtml = html.toLowerCase();
    if (!result.cost) {
      if (/free\s+event/i.test(html) || /free\s+admission/i.test(html) || /no\s+cost/i.test(html) || /free\s+ticket/i.test(html) || /book\s+free/i.test(html) || /free\s+film/i.test(html) || /free\s+screening/i.test(html)) {
        result.cost = 'Free';
      } else if (/\$\d+/.test(html)) {
        const priceMatch = html.match(/\$(\d+(?:\.\d{2})?)/);
        if (priceMatch) result.cost = `$${priceMatch[1]}`;
      } else if (lowerHtml.includes('eventbrite') || lowerHtml.includes('register')) {
        result.cost = 'Free · Registration required';
      }
    }

    return result;
  } catch (err) {
    console.log('[event-crawler] Schema fetch failed for', eventUrl, err.message);
    return null;
  }
}

/**
 * Parse schema.org date strings like "2026-4-1T11:00+10.5:00"
 */
function parseSchemaDate(dateStr) {
  if (!dateStr) return null;
  // Remove timezone offset for simpler parsing — treat as local
  const cleaned = dateStr.replace(/[+-]\d+\.?\d*:\d+$/, '');
  const m = cleaned.match(/(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), parseInt(m[4]), parseInt(m[5]));
}

function formatTimeAmPm(date) {
  let h = date.getHours();
  const min = date.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return min > 0 ? `${h}:${String(min).padStart(2, '0')}${ampm}` : `${h}${ampm}`;
}

function shouldRefreshSchema(event, existingRecord) {
  if (!existingRecord) return true;

  const rawJson = existingRecord.raw_json || {};
  const modifiedChanged = rawJson.modified !== event.modified || rawJson.modified_gmt !== event.modified_gmt;
  if (modifiedChanged) return true;

  if (!existingRecord.start_time || !existingRecord.location || !existingRecord.time_display) {
    return true;
  }

  return false;
}

async function crawlFlindersEvents() {
  if (isEventCrawlRunning) {
    console.log('[event-crawler] Previous crawl still running, skipping this cycle');
    return { skipped: true };
  }

  isEventCrawlRunning = true;
  console.log('[event-crawler] Starting daily event crawl...');

  try {
    const response = await fetchWithTimeout(WP_EVENTS_URL, 15000);
    if (!response.ok) {
      console.log('[event-crawler] WordPress API returned', response.status);
      return;
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      console.log('[event-crawler] Unexpected response format');
      return;
    }

    const wpIds = data.map((event) => event.id).filter(Boolean);
    const { data: existingRows } = wpIds.length > 0
      ? await supabaseAdmin
        .from('flinders_events_cache')
        .select('wp_id, start_time, end_time, time_display, location, cost, raw_json')
        .in('wp_id', wpIds)
      : { data: [] };
    const existingByWpId = new Map((existingRows || []).map((row) => [row.wp_id, row]));

    let upserted = 0;
    for (const ev of data) {
      const title = ev.title?.rendered || '';
      const excerpt = ev.excerpt?.rendered || '';
      const content = ev.content?.rendered || '';
      const classList = ev.class_list || [];
      const categories = categorizeEvent(title, excerpt, content);
      const existingRecord = existingByWpId.get(ev.id);
      let parsed = parseEventDateFromContent(content);
      let location = parseLocationFromContent(content) || parseLocationFromClassList(classList);
      let cost = existingRecord?.cost || null;

      if (ev.link && shouldRefreshSchema(ev, existingRecord)) {
        const schema = await fetchEventPageSchema(ev.link);
        if (schema) {
          if (schema.start_time) {
            parsed = {
              start_time: schema.start_time,
              end_time: schema.end_time || parsed?.end_time || null,
              time_display: schema.time_display || parsed?.time_display || '',
            };
          }
          if (schema.location) location = schema.location;
          if (schema.cost) cost = schema.cost;
        }
      } else if (existingRecord) {
        parsed = {
          start_time: existingRecord.start_time || parsed?.start_time || null,
          end_time: existingRecord.end_time || parsed?.end_time || null,
          time_display: existingRecord.time_display || parsed?.time_display || '',
        };
        location = existingRecord.location || location;
      }

      const record = {
        wp_id: ev.id,
        title,
        excerpt,
        link: ev.link || '',
        image: ev.featured_image_url || ev._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
        event_date: parsed?.start_time || ev.date || null,
        categories,
        location: location || null,
        start_time: parsed?.start_time || null,
        end_time: parsed?.end_time || null,
        time_display: parsed?.time_display || null,
        cost,
        raw_json: ev,
        crawled_at: new Date().toISOString(),
      };

      const { error } = await supabaseAdmin
        .from('flinders_events_cache')
        .upsert(record, { onConflict: 'wp_id' });

      if (!error) upserted++;
      else console.log('[event-crawler] Upsert error:', error.message);
    }

    // Clean up old events (past 30 days)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    await supabaseAdmin
      .from('flinders_events_cache')
      .delete()
      .lt('event_date', cutoff.toISOString());

    console.log(`[event-crawler] Crawled ${upserted}/${data.length} events, cleaned old entries`);
  } catch (err) {
    console.error('[event-crawler] Error:', err.message);
  } finally {
    isEventCrawlRunning = false;
  }
}

function startEventCrawler() {
  crawlFlindersEvents();
  setInterval(crawlFlindersEvents, EVENT_INTERVAL_MS);
  console.log('[event-crawler] Scheduled event crawl (every 30m)');
}

module.exports = { crawlFlindersEvents, startEventCrawler };
