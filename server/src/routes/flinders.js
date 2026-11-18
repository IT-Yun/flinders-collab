const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { supabaseAdmin } = require('../services/supabase');
const { crawlFlindersEvents } = require('../utils/eventCrawler');
const { notifyUsers } = require('../controllers/pushController');

router.use(authenticate);

const FLINAP_CAMPUSES = ['city', 'bedford', 'tonsley'];
const FLINAP_ACTIVITY_STATUSES = ['study', 'in_class', 'meal', 'coffee', 'team_up', 'quiet', 'break'];
const FLINAP_STALE_HOURS = 6;

function normalizeCampus(value) {
  const campus = String(value || '').trim().toLowerCase();
  return FLINAP_CAMPUSES.includes(campus) ? campus : null;
}

function normalizePresenceSource(value) {
  const source = String(value || '').trim().toLowerCase();
  return source === 'gps' ? 'gps' : 'manual';
}

function normalizeActivityStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return FLINAP_ACTIVITY_STATUSES.includes(status) ? status : 'study';
}

function normalizeStatusMessage(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 80) : null;
}

function normalizeFriendMessage(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 160) : null;
}

function buildPairKey(userA, userB) {
  return [String(userA), String(userB)].sort().join(':');
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function ensureRoomMembership(roomId, userId, role = 'member') {
  const { data: existing } = await supabaseAdmin
    .from('room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.id) return;

  await supabaseAdmin
    .from('room_members')
    .insert({
      room_id: roomId,
      user_id: userId,
      role,
      last_visited_at: new Date().toISOString(),
    });
}

async function getOrCreateDirectRoom(requesterId, targetId, requesterName, targetName) {
  const pairKey = buildPairKey(requesterId, targetId);

  const { data: existingRoom } = await supabaseAdmin
    .from('rooms')
    .select('id')
    .eq('direct_pair_key', pairKey)
    .maybeSingle();

  if (existingRoom?.id) {
    await ensureRoomMembership(existingRoom.id, requesterId, 'owner');
    await ensureRoomMembership(existingRoom.id, targetId, 'member');
    return existingRoom.id;
  }

  const roomName = `${requesterName || 'Student'} & ${targetName || 'Student'}`;
  const { data: createdRoom, error: roomError } = await supabaseAdmin
    .from('rooms')
    .insert({
      name: roomName,
      course_name: 'Direct Chat',
      description: 'Private chat from Flinders Social',
      owner_id: requesterId,
      invite_code: generateInviteCode(),
      room_type: 'direct',
      direct_pair_key: pairKey,
    })
    .select('id')
    .single();

  if (roomError || !createdRoom?.id) {
    throw new Error('Failed to create direct room');
  }

  await ensureRoomMembership(createdRoom.id, requesterId, 'owner');
  await ensureRoomMembership(createdRoom.id, targetId, 'member');
  return createdRoom.id;
}

function getPresenceCutoffIso() {
  return new Date(Date.now() - FLINAP_STALE_HOURS * 60 * 60 * 1000).toISOString();
}

function groupPresenceRows(rows, currentUserId) {
  const campuses = {
    city: [],
    bedford: [],
    tonsley: [],
  };
  let my_presence = null;

  for (const row of rows || []) {
    const campus = normalizeCampus(row.campus);
    if (!campus) continue;

    const member = {
      user_id: row.user_id,
      full_name: row.users?.full_name || 'Student',
      avatar_url: row.users?.avatar_url || null,
      major: row.users?.major || null,
      year_level: row.users?.year_level || null,
      semester: row.users?.semester || null,
      campus,
      activity_status: normalizeActivityStatus(row.activity_status),
      status_message: normalizeStatusMessage(row.status_message),
      source: row.source || 'manual',
      updated_at: row.updated_at,
      is_me: row.user_id === currentUserId,
    };

    campuses[campus].push(member);
    if (member.is_me) my_presence = member;
  }

  for (const campus of Object.keys(campuses)) {
    campuses[campus].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  }

  return { campuses, my_presence };
}

function mapFriendRequestRow(row, currentUserId) {
  const requester = row.requester || {};
  const target = row.target || {};
  const otherUser = row.requester_id === currentUserId ? target : requester;
  const direction = row.requester_id === currentUserId ? 'outgoing' : 'incoming';

  const locationVisibleTo = Array.isArray(row.location_visible_to) ? row.location_visible_to : [];

  return {
    id: row.id,
    status: row.status,
    message: normalizeFriendMessage(row.message),
    direct_room_id: row.direct_room_id || null,
    location_shared: locationVisibleTo.includes(currentUserId),
    created_at: row.created_at,
    responded_at: row.responded_at || null,
    direction,
    other_user: {
      user_id: otherUser.id || null,
      full_name: otherUser.full_name || 'Student',
      avatar_url: otherUser.avatar_url || null,
      major: otherUser.major || null,
      year_level: otherUser.year_level || null,
      university_email: otherUser.university_email || null,
    },
  };
}

// Shared categorization logic
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
const WEEKDAY_PATTERN = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
const MONTH_PATTERN = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';

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

/**
 * Parse actual event date/time from content HTML.
 * Handles patterns like:
 *   "16 March 2026, 10am – 11:15am"
 *   "9 April 2026 12:15 – 1:00 pm" (only end has am/pm)
 *   "10 June 2026 5:00 pm - 7:00 pm"
 */
function parseEventDateFromContent(contentHtml) {
  if (!contentHtml) return null;
  const text = stripHtmlTags(contentHtml);
  const datePrefix = `(?:Date:\\s*)?(?:${WEEKDAY_PATTERN}\\s+)?`;

  // Pattern 1: Both times have am/pm — "10am – 11:15am"
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

  // Pattern 2: Only end time has am/pm — "12:15 – 1:00 pm"
  const endOnlyAmPm = text.match(
    new RegExp(`${datePrefix}(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4}),?[\\s\\S]{0,40}?(\\d{1,2}(?:[:.]\\d{2})?)\\s*[–\\-]\\s*(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm))`, 'i')
  );
  if (endOnlyAmPm) {
    const day = parseInt(endOnlyAmPm[1]);
    const month = MONTHS[endOnlyAmPm[2].toLowerCase()];
    const year = parseInt(endOnlyAmPm[3]);
    const et = parseTime(endOnlyAmPm[5]);
    // Infer start am/pm from end time
    const startRaw = endOnlyAmPm[4].trim();
    const endAmPm = endOnlyAmPm[5].match(/(am|pm)/i)?.[1] || 'am';
    const st = parseTime(startRaw + endAmPm);
    const startDisplay = startRaw.includes(':') ? startRaw : startRaw;
    const endDisplay = endOnlyAmPm[5].trim();
    return {
      start_time: new Date(year, month, day, st?.h || 0, st?.m || 0).toISOString(),
      end_time: et ? new Date(year, month, day, et.h, et.m).toISOString() : null,
      time_display: `${startDisplay} – ${endDisplay}`,
    };
  }

  // Pattern 3: Single time — "16 March 2026, 10am"
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

  // Pattern 4: Date only — "16 March 2026"
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

/**
 * Parse location from class_list CSS classes.
 * e.g. "event_location-flinders-city-campus-level-3-room-309"
 */
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

/**
 * Parse location from content HTML bold tags.
 * e.g. <strong>Flinders City Campus | Level 3 | Room 309</strong>
 */
function parseLocationFromContent(contentHtml) {
  if (!contentHtml) return '';
  const boldBlocks = contentHtml.match(/<strong>([^<]+)<\/strong>/gi) || [];
  for (const block of boldBlocks) {
    const text = stripHtmlTags(block);
    // Skip date strings
    if (/\d{4}/.test(text) && /(?:am|pm)/i.test(text)) continue;
    if (/(?:Campus|Room|Building|Hall|Library|Theatre|Online|Level)/i.test(text)) {
      return text;
    }
  }
  return '';
}

/**
 * Parse schema.org date strings like "2026-4-1T11:00+10.5:00"
 */
function parseSchemaDate(dateStr) {
  if (!dateStr) return null;
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

/**
 * Fetch individual event page and parse JSON-LD schema for date/time/location.
 */
async function fetchEventPageSchema(eventUrl) {
  if (!eventUrl) return null;
  try {
    const res = await fetch(eventUrl);
    if (!res.ok) return null;
    const html = await res.text();
    const result = {};
    const event = extractEventJsonLd(html);
    if (event?.startDate) {
      const sd = parseSchemaDate(event.startDate);
      if (sd) result.start_time = sd.toISOString();
    }
    if (event?.endDate) {
      const ed = parseSchemaDate(event.endDate);
      if (ed) result.end_time = ed.toISOString();
    }
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

    // Parse cost/registration info from page content
    if (event?.offers) {
      const offer = Array.isArray(event.offers) ? event.offers[0] : event.offers;
      if (offer?.price === 0 || offer?.price === '0') result.cost = 'Free';
      else if (offer?.price) result.cost = `$${offer.price}`;
    }
    // Check page text for cost clues
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
  } catch {
    return null;
  }
}

function mapWpEvent(ev) {
  const title = ev.title?.rendered || '';
  const excerpt = ev.excerpt?.rendered || '';
  const content = ev.content?.rendered || '';
  const classList = ev.class_list || [];

  // Parse actual event date from content HTML
  const parsed = parseEventDateFromContent(content);

  // Parse location from class_list and content
  let location = parseLocationFromContent(content) || parseLocationFromClassList(classList);
  // Check if online event
  if (!location && classList.some((c) => c.includes('online'))) {
    location = 'Online';
  }

  return {
    id: ev.id,
    title,
    date: parsed?.start_time || ev.date || '',
    excerpt,
    link: ev.link || '',
    image: ev.featured_image_url || ev._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
    categories: categorizeEvent(title, excerpt, content),
    location,
    start_time: parsed?.start_time || null,
    end_time: parsed?.end_time || null,
    time_display: parsed?.time_display || '',
    cost: '',
    _needsSchemaFetch: !!ev.link,
    _link: ev.link || '',
  };
}

/**
 * Enrich events that have no content by fetching individual event pages.
 * Runs schema fetches in parallel (max 5 concurrent).
 */
async function enrichEventsWithSchema(events) {
  const needsFetch = events.filter((e) => e._needsSchemaFetch);
  if (needsFetch.length === 0) return events;

  const results = await Promise.all(
    needsFetch.map((e) => fetchEventPageSchema(e._link))
  );

  const schemaMap = new Map();
  needsFetch.forEach((e, i) => {
    if (results[i]) schemaMap.set(e.id, results[i]);
  });

  // Persist enriched data back to DB so future requests don't re-fetch
  const dbUpdates = [];

  const enriched = events.map((e) => {
    const schema = schemaMap.get(e.id);
    if (schema) {
      if (schema.start_time) {
        e.start_time = schema.start_time;
        e.date = schema.start_time;
      }
      if (schema.end_time) e.end_time = schema.end_time;
      if (schema.time_display) e.time_display = schema.time_display;
      if (schema.location) e.location = schema.location;
      if (schema.cost) e.cost = schema.cost;

      // Queue DB update
      const update = {};
      if (schema.start_time) { update.start_time = schema.start_time; update.event_date = schema.start_time; }
      if (schema.end_time) update.end_time = schema.end_time;
      if (schema.time_display) update.time_display = schema.time_display;
      if (schema.location) update.location = schema.location;
      if (schema.cost) update.cost = schema.cost;
      if (Object.keys(update).length > 0) {
        dbUpdates.push(supabaseAdmin.from('flinders_events_cache').update(update).eq('wp_id', e.id));
      }
    }
    delete e._needsSchemaFetch;
    delete e._link;
    return e;
  });

  // Fire-and-forget DB updates
  if (dbUpdates.length > 0) {
    Promise.all(dbUpdates).catch(() => {});
  }

  return enriched;
}

// GET /api/flinders/events
router.get('/flinders/events', async (req, res) => {
  try {
    const response = await fetch(
      'https://events.flinders.edu.au/wp-json/wp/v2/ajde_events?per_page=20'
    );
    if (!response.ok) return res.json([]);
    const data = await response.json();
    let events = (Array.isArray(data) ? data : []).map(mapWpEvent);
    events = await enrichEventsWithSchema(events);
    res.json(events);
  } catch (err) {
    console.error('Flinders events proxy error:', err.message);
    res.json([]);
  }
});

// GET /api/flinders/recommended-events
router.get('/flinders/recommended-events', async (req, res) => {
  try {
    const interests = req.query.interests
      ? req.query.interests.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let events = [];

    // Try DB cache first
    try {
      const { data: cached } = await supabaseAdmin
        .from('flinders_events_cache')
        .select('*')
        .order('event_date', { ascending: true });

      if (cached && cached.length > 0) {
        events = cached.map((row) => ({
          id: row.wp_id,
          title: row.title,
          date: row.start_time || row.event_date || '',
          excerpt: row.excerpt || '',
          raw_content: row.raw_json?.content?.rendered || '',
          link: row.link || '',
          image: row.image || null,
          categories: row.categories || categorizeEvent(row.title, row.excerpt, row.raw_json?.content?.rendered || ''),
          location: row.location || '',
          start_time: row.start_time || null,
          end_time: row.end_time || null,
          time_display: row.time_display || '',
          cost: row.cost || '',
          // Mark events missing time for schema enrichment
          _needsSchemaFetch: !row.time_display && !!row.link,
          _link: row.link || '',
        }));
        // Enrich cached events missing time/location from schema.org
        events = await enrichEventsWithSchema(events);
        // Re-categorize with updated data (strip class_list noise)
        events = events.map((e) => ({
          ...e,
          categories: categorizeEvent(e.title, e.excerpt, e.raw_content),
        }));
        events = events.map(({ raw_content, ...event }) => event);
      }
    } catch {
      // Cache table may not exist yet
    }

    // Fallback: live WordPress API
    if (events.length === 0) {
      try {
        const response = await fetch(
          'https://events.flinders.edu.au/wp-json/wp/v2/ajde_events?per_page=50'
        );
        if (response.ok) {
          const data = await response.json();
          events = (Array.isArray(data) ? data : []).map(mapWpEvent);
          events = await enrichEventsWithSchema(events);
          crawlFlindersEvents().catch(() => {});
        }
      } catch {
        // Both failed
      }
    }

    // Filter past events — only show today and future
    events = events.filter((e) => {
      if (!e.date) return true; // keep events without dates
      try {
        return new Date(e.date) >= today;
      } catch {
        return true;
      }
    });

    events.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    const career = events.filter((e) => e.categories.includes('Career'));
    const recommended = interests.length > 0
      ? events.filter((e) => e.categories.some((c) => interests.includes(c)))
      : [];

    res.json({ recommended, career, all: events });
  } catch (err) {
    console.error('Flinders recommended events error:', err.message);
    res.json({ recommended: [], career: [], all: [] });
  }
});

// GET /api/flinders/news — proxy Flinders student news
router.get('/flinders/news', async (req, res) => {
  try {
    const response = await fetch(
      'https://news.flinders.edu.au/wp-json/wp/v2/posts?per_page=10&categories=students'
    );
    if (!response.ok) return res.json([]);
    const data = await response.json();
    const articles = (Array.isArray(data) ? data : []).map((post) => ({
      id: post.id,
      title: post.title?.rendered || '',
      date: post.date || '',
      excerpt: post.excerpt?.rendered || '',
      link: post.link || '',
      image: post.featured_image_url || post._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
    }));
    res.json(articles);
  } catch (err) {
    console.error('Flinders news proxy error:', err.message);
    res.json([]);
  }
});

router.get('/flinders/campus-presence', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('flinders_campus_presence')
      .select(`
        user_id,
        campus,
        activity_status,
        status_message,
        source,
        updated_at,
        users:user_id (
          id,
          full_name,
          avatar_url,
          major,
          year_level,
          semester
        )
      `)
      .eq('sharing_enabled', true)
      .gte('updated_at', getPresenceCutoffIso())
      .order('updated_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to load Flinap presence' });
    }

    const grouped = groupPresenceRows(data || [], req.user.id);
    res.json({
      stale_after_hours: FLINAP_STALE_HOURS,
      ...grouped,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load Flinap presence' });
  }
});

router.post('/flinders/campus-presence', async (req, res) => {
  try {
    const campus = normalizeCampus(req.body.campus);
    const activityStatus = normalizeActivityStatus(req.body.activity_status);
    const statusMessage = normalizeStatusMessage(req.body.status_message);
    const source = normalizePresenceSource(req.body.source);

    if (!campus) {
      return res.status(400).json({ error: 'Campus must be city, bedford, or tonsley' });
    }

    const { data, error } = await supabaseAdmin
      .from('flinders_campus_presence')
      .upsert({
        user_id: req.user.id,
        campus,
        activity_status: activityStatus,
        status_message: statusMessage,
        source,
        sharing_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select(`
        user_id,
        campus,
        activity_status,
        status_message,
        source,
        updated_at,
        users:user_id (
          id,
          full_name,
          avatar_url,
          major,
          year_level,
          semester
        )
      `)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to update Flinap presence' });
    }

    res.json({
      user_id: data.user_id,
      full_name: data.users?.full_name || req.user.user_metadata?.full_name || 'Student',
      avatar_url: data.users?.avatar_url || null,
      major: data.users?.major || null,
      year_level: data.users?.year_level || null,
      semester: data.users?.semester || null,
      campus: data.campus,
      activity_status: normalizeActivityStatus(data.activity_status),
      status_message: normalizeStatusMessage(data.status_message),
      source: data.source,
      updated_at: data.updated_at,
      is_me: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update Flinap presence' });
  }
});

router.delete('/flinders/campus-presence', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('flinders_campus_presence')
      .delete()
      .eq('user_id', req.user.id);

    if (error) {
      return res.status(500).json({ error: 'Failed to hide Flinap presence' });
    }

    res.json({ message: 'Flinap presence hidden' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to hide Flinap presence' });
  }
});

router.get('/flinders/friend-requests', async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('flinders_friend_requests')
      .select(`
        id,
        requester_id,
        target_id,
        message,
        status,
        direct_room_id,
        location_visible_to,
        created_at,
        responded_at,
        requester:requester_id (
          id,
          full_name,
          avatar_url,
          major,
          year_level,
          university_email
        ),
        target:target_id (
          id,
          full_name,
          avatar_url,
          major,
          year_level,
          university_email
        )
      `)
      .or(`requester_id.eq.${userId},target_id.eq.${userId}`)
      .not('status', 'eq', 'blocked')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to load friend requests' });
    }

    const requests = (data || []).map((row) => mapFriendRequestRow(row, userId));
    res.json({
      incoming: requests.filter((row) => row.direction === 'incoming' && row.status === 'pending'),
      outgoing: requests.filter((row) => row.direction === 'outgoing' && row.status === 'pending'),
      friends: requests.filter((row) => row.status === 'accepted'),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load friend requests' });
  }
});

router.post('/flinders/friend-requests', async (req, res) => {
  try {
    const requesterId = req.user.id;
    const targetId = String(req.body.target_user_id || '').trim();
    const message = normalizeFriendMessage(req.body.message);

    if (!targetId || targetId === requesterId) {
      return res.status(400).json({ error: 'Choose another student to add.' });
    }

    const pairKey = buildPairKey(requesterId, targetId);
    const { data: existing } = await supabaseAdmin
      .from('flinders_friend_requests')
      .select('id, status, requester_id, target_id, direct_room_id')
      .eq('pair_key', pairKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.status === 'accepted') {
      return res.status(409).json({ error: 'You are already connected.', direct_room_id: existing.direct_room_id || null });
    }

    if (existing?.status === 'pending') {
      return res.status(409).json({ error: 'A friend request is already pending.' });
    }

    const { data, error } = await supabaseAdmin
      .from('flinders_friend_requests')
      .insert({
        requester_id: requesterId,
        target_id: targetId,
        message,
        status: 'pending',
        pair_key: pairKey,
      })
      .select(`
        id,
        requester_id,
        target_id,
        message,
        status,
        direct_room_id,
        created_at,
        responded_at,
        requester:requester_id (
          id,
          full_name,
          avatar_url
        ),
        target:target_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to send friend request' });
    }

    await notifyUsers([targetId], {
      type: 'friend_requests',
      title: 'New friend request',
      body: `${req.user.user_metadata?.full_name || 'A student'} sent you a friend request on Flinders Social.`,
      url: '/board',
    });

    res.status(201).json(mapFriendRequestRow(data, requesterId));
  } catch (err) {
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

router.post('/flinders/friend-requests/:requestId/respond', async (req, res) => {
  try {
    const requestId = String(req.params.requestId || '').trim();
    const action = String(req.body.action || '').trim().toLowerCase();
    const userId = req.user.id;

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accept or decline' });
    }

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from('flinders_friend_requests')
      .select(`
        id,
        requester_id,
        target_id,
        message,
        status,
        pair_key,
        direct_room_id,
        requester:requester_id (
          id,
          full_name
        ),
        target:target_id (
          id,
          full_name
        )
      `)
      .eq('id', requestId)
      .maybeSingle();

    if (requestError || !requestRow) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (requestRow.target_id !== userId) {
      return res.status(403).json({ error: 'You cannot respond to this friend request' });
    }

    if (requestRow.status !== 'pending') {
      return res.status(409).json({ error: 'This friend request has already been handled.' });
    }

    const directRoomId = requestRow.direct_room_id || null;

    const nextStatus = action === 'accept' ? 'accepted' : 'declined';
    const { data, error } = await supabaseAdmin
      .from('flinders_friend_requests')
      .update({
        status: nextStatus,
        direct_room_id: directRoomId,
        responded_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select(`
        id,
        requester_id,
        target_id,
        message,
        status,
        direct_room_id,
        created_at,
        responded_at,
        requester:requester_id (
          id,
          full_name,
          avatar_url
        ),
        target:target_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to respond to friend request' });
    }

    if (action === 'accept') {
      await notifyUsers([requestRow.requester_id], {
        type: 'friend_requests',
        title: 'Friend request accepted',
        body: `${requestRow.target?.full_name || 'A student'} accepted your friend request.`,
        url: '/messages',
      });
    }

    res.json(mapFriendRequestRow(data, userId));
  } catch (err) {
    res.status(500).json({ error: 'Failed to respond to friend request' });
  }
});

// POST /flinders/friend-requests/:requestId/direct-room — Create or fetch DM room on demand
router.post('/flinders/friend-requests/:requestId/direct-room', async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = String(req.params.requestId || '').trim();

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from('flinders_friend_requests')
      .select(`
        id,
        requester_id,
        target_id,
        status,
        direct_room_id,
        requester:requester_id (
          id,
          full_name,
          avatar_url
        ),
        target:target_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('id', requestId)
      .maybeSingle();

    if (requestError || !requestRow) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (requestRow.requester_id !== userId && requestRow.target_id !== userId) {
      return res.status(403).json({ error: 'You cannot open this chat' });
    }

    if (requestRow.status !== 'accepted') {
      return res.status(409).json({ error: 'Direct chat is only available after the friend request is accepted.' });
    }

    const directRoomId = await getOrCreateDirectRoom(
      requestRow.requester_id,
      requestRow.target_id,
      requestRow.requester?.full_name,
      requestRow.target?.full_name,
    );

    const { data, error } = await supabaseAdmin
      .from('flinders_friend_requests')
      .update({ direct_room_id: directRoomId })
      .eq('id', requestId)
      .select(`
        id,
        requester_id,
        target_id,
        message,
        status,
        direct_room_id,
        created_at,
        responded_at,
        requester:requester_id (
          id,
          full_name,
          avatar_url
        ),
        target:target_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to open direct chat' });
    }

    res.json(mapFriendRequestRow(data, userId));
  } catch (err) {
    res.status(500).json({ error: 'Failed to open direct chat' });
  }
});

// DELETE /flinders/friend-requests/:requestId — Remove/unfriend
router.delete('/flinders/friend-requests/:requestId', async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = String(req.params.requestId || '').trim();

    const { data: row } = await supabaseAdmin
      .from('flinders_friend_requests')
      .select('id, requester_id, target_id, direct_room_id')
      .eq('id', requestId)
      .maybeSingle();

    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.requester_id !== userId && row.target_id !== userId) {
      return res.status(403).json({ error: 'Not your friend request' });
    }

    // Delete the friend request
    await supabaseAdmin.from('flinders_friend_requests').delete().eq('id', requestId);

    // Optionally clean up the DM room
    if (row.direct_room_id) {
      await supabaseAdmin.from('room_members').delete().eq('room_id', row.direct_room_id);
      await supabaseAdmin.from('rooms').delete().eq('id', row.direct_room_id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// POST /flinders/friend-requests/:requestId/block — Block a user
router.post('/flinders/friend-requests/:requestId/block', async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = String(req.params.requestId || '').trim();

    const { data: row } = await supabaseAdmin
      .from('flinders_friend_requests')
      .select('id, requester_id, target_id, direct_room_id')
      .eq('id', requestId)
      .maybeSingle();

    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.requester_id !== userId && row.target_id !== userId) {
      return res.status(403).json({ error: 'Not your friend request' });
    }

    // Update status to blocked
    await supabaseAdmin
      .from('flinders_friend_requests')
      .update({ status: 'blocked', responded_at: new Date().toISOString() })
      .eq('id', requestId);

    // Clean up DM room if exists
    if (row.direct_room_id) {
      await supabaseAdmin.from('room_members').delete().eq('room_id', row.direct_room_id);
      await supabaseAdmin.from('rooms').delete().eq('id', row.direct_room_id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// PATCH /flinders/friend-requests/:requestId/location-visibility — Toggle location sharing
router.patch('/flinders/friend-requests/:requestId/location-visibility', async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = String(req.params.requestId || '').trim();
    const { visible } = req.body;

    const { data: row } = await supabaseAdmin
      .from('flinders_friend_requests')
      .select('id, requester_id, target_id, location_visible_to')
      .eq('id', requestId)
      .maybeSingle();

    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.requester_id !== userId && row.target_id !== userId) {
      return res.status(403).json({ error: 'Not your friend request' });
    }

    // location_visible_to is a JSONB array of user IDs who can see the other's location
    const currentList = Array.isArray(row.location_visible_to) ? row.location_visible_to : [];
    let nextList;
    if (visible) {
      nextList = currentList.includes(userId) ? currentList : [...currentList, userId];
    } else {
      nextList = currentList.filter((id) => id !== userId);
    }

    await supabaseAdmin
      .from('flinders_friend_requests')
      .update({ location_visible_to: nextList })
      .eq('id', requestId);

    res.json({ success: true, location_visible_to: nextList });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update location visibility' });
  }
});

module.exports = router;
