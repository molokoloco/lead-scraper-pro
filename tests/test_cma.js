const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    locale: 'fr-FR', timezoneId: 'Europe/Paris',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await ctx.newPage();

  // Test CMA IDF avec form submit
  await page.goto('https://www.cma-idf.fr/annuaire', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Cocher Pantin si dispo
  try {
    await page.check('input[id*="pantin"]');
    console.log('Coché Pantin');
  } catch { console.log('Pas de checkbox Pantin'); }

  // Remplir + soumettre
  await page.fill('input[name="key"]', 'pantin');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);

  const results = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.views-row, .artisan-item, article, .result')];
    const emails = (document.body.innerText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || []);
    const links = [...document.querySelectorAll('a[href]')].filter(a => /artisan|pro\/|entreprise/.test(a.href)).slice(0, 5).map(a => a.href);
    return {
      url: location.href,
      rows: rows.length,
      emails,
      links,
      text: document.body.innerText.substring(0, 500).replace(/\n+/g, ' ')
    };
  });
  console.log('URL:', results.url.substring(0, 100));
  console.log('Rows:', results.rows);
  console.log('Emails:', results.emails);
  console.log('Links:', results.links);
  console.log('Text:', results.text.substring(0, 300));

  // Test 118000.fr
  console.log('\n--- 118000.fr ---');
  await page.goto('https://www.118000.fr/search?who=coiffeur&where=pantin+93500', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  const data118 = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.resultItem, .result-item, .pro-item, [class*="result"]')].slice(0, 5);
    const emails = (document.body.innerText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || []);
    const names = [...document.querySelectorAll('h2, h3, .name, [class*="denomination"]')].slice(0, 8).map(el => el.innerText.trim()).filter(Boolean);
    return { url: location.href, cards: cards.length, emails, names, text: document.body.innerText.substring(0, 400).replace(/\n+/g, ' ') };
  });
  console.log('URL:', data118.url.substring(0, 80));
  console.log('Cards:', data118.cards, '| Names:', data118.names.slice(0, 5));
  console.log('Emails:', data118.emails.slice(0, 5));
  console.log('Text:', data118.text.substring(0, 200));

  await browser.close();
})().catch(console.error);
