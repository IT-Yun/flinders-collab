const { supabaseAdmin } = require('../services/supabase');

const SITEMAP_INDEX = 'https://handbook.flinders.edu.au/sitemap.xml';
const TOPIC_YEAR = Number(process.env.TOPIC_CRAWL_YEAR || new Date().getFullYear());
const CONCURRENCY = 5;
const DELAY_BETWEEN_MS = 200;
const FETCH_TIMEOUT_MS = 10000;
let isTopicCrawlRunning = false;

/**
 * Fetch with timeout to prevent hanging requests.
 */
async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch and parse sitemap XML to extract topic URLs for the target year.
 */
async function getTopicUrls() {
  console.log('[topic-crawler] Fetching sitemap index...');
  const indexRes = await fetchWithTimeout(SITEMAP_INDEX, 15000);
  if (!indexRes.ok) throw new Error(`Sitemap index returned ${indexRes.status}`);
  const indexXml = await indexRes.text();

  const sitemapUrls = [...indexXml.matchAll(/<loc>(https:\/\/handbook\.flinders\.edu\.au\/sitemap\/[^<]+)<\/loc>/g)]
    .map((m) => m[1]);

  console.log(`[topic-crawler] Found ${sitemapUrls.length} sitemaps`);

  const topicUrls = [];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const res = await fetchWithTimeout(sitemapUrl, 15000);
      if (!res.ok) continue;
      const xml = await res.text();

      const pattern = new RegExp(`<loc>(https://handbook\\.flinders\\.edu\\.au/topics/${TOPIC_YEAR}/[^<]+)</loc>`, 'g');
      for (const m of xml.matchAll(pattern)) {
        topicUrls.push(m[1]);
      }
    } catch (err) {
      console.log(`[topic-crawler] Sitemap fetch failed: ${sitemapUrl}`, err.message);
    }
  }

  console.log(`[topic-crawler] Found ${topicUrls.length} topic URLs for ${TOPIC_YEAR}`);
  return topicUrls;
}

/**
 * Fetch a single topic page and extract data from the __NEXT_DATA__ script tag.
 */
async function fetchTopicData(url) {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const html = await res.text();

    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) return null;

    const nextData = JSON.parse(nextDataMatch[1]);
    const pageContent = nextData?.props?.pageProps?.pageContent;
    if (!pageContent) return null;

    const urlCode = url.split('/').pop().toUpperCase();

    const rawOfferings = pageContent.offering || [];
    const semesters = [...new Set(rawOfferings.map((o) => o.admission_calendar?.value || o.teaching_period?.value).filter(Boolean))];
    const campuses = [...new Set(rawOfferings.map((o) => o.location?.value).filter(Boolean))];
    const deliveryModes = [...new Set(rawOfferings.map((o) => o.mode?.value || o.attendance_mode?.value).filter(Boolean))];

    // Structured offerings for timetable selection
    const offerings = rawOfferings.map((o) => ({
      semester: o.admission_calendar?.value || o.teaching_period?.value || null,
      campus: o.location?.value || null,
      mode: o.mode?.value || o.attendance_mode?.value || null,
      display_name: o.display_name || null,
    })).filter((o) => o.semester || o.campus);

    const description = (pageContent.description || '')
      .replace(/<[^>]*>/g, '').replace(/&\w+;/g, ' ').trim().slice(0, 2000);
    const prerequisites = (pageContent.pre_requisites || '')
      .replace(/<[^>]*>/g, '').replace(/&\w+;/g, ' ').trim();

    return {
      topic_code: (pageContent.code || urlCode).toUpperCase(),
      title: pageContent.title || '',
      description: description || null,
      credit_points: pageContent.credit_points_display || pageContent.credit_points || null,
      level: pageContent.level?.label || null,
      school: pageContent.school?.value || pageContent.parent_record?.value || null,
      academic_org: pageContent.academic_org?.value || null,
      year: TOPIC_YEAR,
      semesters: semesters.length > 0 ? semesters : null,
      campuses: campuses.length > 0 ? campuses : null,
      delivery_modes: deliveryModes.length > 0 ? deliveryModes : null,
      offerings: offerings.length > 0 ? offerings : null,
      prerequisites: prerequisites || null,
      handbook_url: url,
      crawled_at: new Date().toISOString(),
    };
  } catch (err) {
    // Silently skip failed pages
    return null;
  }
}

/**
 * Run the full topic crawl: fetch sitemap → scrape each topic → upsert to DB.
 * Each URL is processed one at a time with error isolation — a single failure never stops the crawl.
 */
async function crawlFlindersTopics() {
  if (isTopicCrawlRunning) {
    console.log('[topic-crawler] Previous crawl still running, skipping this cycle');
    return { skipped: true };
  }

  isTopicCrawlRunning = true;
  try {
    console.log('[topic-crawler] Starting topic crawl...');
    const start = Date.now();

    let urls;
    try {
      urls = await getTopicUrls();
    } catch (err) {
      console.error('[topic-crawler] Failed to get URLs:', err.message);
      return { error: err.message };
    }

    if (urls.length === 0) {
      console.log('[topic-crawler] No topic URLs found, aborting');
      return { upserted: 0, total: 0 };
    }

    let upserted = 0;
    let skipped = 0;
    let failed = 0;

    // Process sequentially with small concurrency window
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY);

      // Fetch all in batch concurrently, each with its own try-catch
      const results = await Promise.allSettled(batch.map((url) => fetchTopicData(url)));

      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) {
          skipped++;
          continue;
        }

        try {
          const { error } = await supabaseAdmin
            .from('flinders_topics')
            .upsert(result.value, { onConflict: 'topic_code,year' });

          if (error) {
            failed++;
          } else {
            upserted++;
          }
        } catch {
          failed++;
        }
      }

      // Progress log every 200
      const progress = Math.min(i + CONCURRENCY, urls.length);
      if (progress % 200 < CONCURRENCY) {
        console.log(`[topic-crawler] ${progress}/${urls.length} — ${upserted} ok, ${skipped} skip, ${failed} fail`);
      }

      // Small delay between batches
      if (i + CONCURRENCY < urls.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_MS));
      }
    }

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[topic-crawler] Done in ${duration}s: ${upserted} upserted, ${skipped} skipped, ${failed} failed / ${urls.length} total`);
    return { upserted, skipped, failed, total: urls.length, duration };
  } finally {
    isTopicCrawlRunning = false;
  }
}

/**
 * Start the topic crawler on a weekly schedule.
 */
function startTopicCrawler() {
  setTimeout(async () => {
    try {
      const { count } = await supabaseAdmin
        .from('flinders_topics')
        .select('id', { count: 'exact', head: true });

      if ((count || 0) < 500) {
        console.log(`[topic-crawler] Only ${count || 0} topics in DB, starting crawl...`);
        crawlFlindersTopics().catch((err) => console.error('[topic-crawler] Crawl error:', err.message));
      } else {
        console.log(`[topic-crawler] ${count} topics already in DB, skipping initial crawl`);
      }
    } catch (err) {
      console.log('[topic-crawler] Check failed:', err.message);
    }
  }, 30000);

  const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;
  setInterval(crawlFlindersTopics, WEEKLY_MS).unref();
  console.log('[topic-crawler] Scheduled weekly crawl');
}

/**
 * Fetch and upsert a single topic by code (on-demand when search misses).
 */
async function fetchSingleTopic(topicCode) {
  const code = topicCode.trim().toLowerCase();
  const url = `https://handbook.flinders.edu.au/topics/${TOPIC_YEAR}/${code}`;
  const data = await fetchTopicData(url);
  if (!data) return null;

  const { error } = await supabaseAdmin
    .from('flinders_topics')
    .upsert(data, { onConflict: 'topic_code,year' });

  if (error) {
    console.log(`[topic-crawler] Single upsert error for ${topicCode}:`, error.message);
    return null;
  }

  console.log(`[topic-crawler] On-demand fetched: ${data.topic_code} — ${data.title}`);
  return data;
}

module.exports = { crawlFlindersTopics, startTopicCrawler, fetchSingleTopic };
