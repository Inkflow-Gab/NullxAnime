// Non-blocking probe of AniList's chronological feed from a GitHub Pages origin.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
const note = (level, text) => console.log(`::${level}::${text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
let browser;
try {
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: 'shell', args: [...chromium.args, '--no-sandbox'] });
  const page = await browser.newPage();
  const probe = 'https://inkflow-gab.github.io/__nx_releases_probe__';
  await page.setRequestInterception(true);
  page.on('request', (req) => req.url() === probe ? req.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Release probe</title>' }) : req.continue());
  await page.goto(probe, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const result = await page.evaluate(async () => {
    const now = Math.floor(Date.now() / 1000);
    const query = `query RecentEpisodes($from: Int, $to: Int, $page: Int) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage } airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME_DESC) { airingAt episode media { id isAdult format bannerImage coverImage { large } title { romaji } } } } }`;
    async function get(page) {
      const response = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables: { from: 0, to: now, page } }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.errors?.length) throw new Error(data.errors[0].message);
      return data.data.Page;
    }
    const first = await get(1);
    const second = first.pageInfo.hasNextPage ? await get(2) : null;
    const events = [...first.airingSchedules, ...(second?.airingSchedules || [])];
    return { count: events.length, ordered: events.every((e, i) => e.airingAt < now && (!i || events[i - 1].airingAt >= e.airingAt)), images: events.filter((e) => e.media?.bannerImage || e.media?.coverImage?.large).length, next: !!second };
  });
  const ok = result.count > 0 && result.ordered && result.images > 0 && result.next;
  note(ok ? 'notice' : 'warning', `AniList release probe: ${result.count} events across ${result.next ? 'two pages' : 'one page'}; newest-first=${result.ordered}; events with artwork=${result.images}.`);
} catch (e) { note('warning', `AniList release probe failed: ${e.message}`); }
finally { await browser?.close(); }
