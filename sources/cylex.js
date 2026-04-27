const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const config = require('../config');
chromium.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '..', 'data', config.version, 'cylex_results.csv');
const CATEGORIES = config.categories.map(c => c.replace(/ /g, '+'));
const CITY = config.location.name.toLowerCase().split(' ')[0];

const EMAIL_BL = ['cylex','google','bing','facebook','example','sentry','apple','microsoft','w3.org'];

function parseEmail(text) {
  return [...new Set(text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [])]
    .filter(e => !EMAIL_BL.some(d => e.includes(d)) && e.length < 80);
}

async function scrapeCylexCategory(page, category) {
  const url = `https://www.cylex-locale.fr/${CITY}/${encodeURIComponent(category)}.html`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(1500);

    const status = await page.evaluate(() =>
      document.title.includes('404') || document.body.innerText.includes('introuvable') ? '404' : 'OK'
    );
    if (status === '404') return [];

    // Récupérer liens vers fiches individuelles
    const businessLinks = await page.evaluate(() => {
      return [...document.querySelectorAll('a[href*="/entreprises/"]')]
        .map(a => a.href)
        .filter(h => h.includes('cylex-locale.fr/entreprises/'));
    });
    return [...new Set(businessLinks)];
  } catch { return []; }
}

async function scrapeCylexBusiness(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(1200);

    return await page.evaluate(() => {
      const text = document.body.innerText;
      const name = document.querySelector('h1, [class*="name"], [class*="title"]')?.innerText?.trim() || '';
      const addrEl = document.querySelector('[class*="address"], [itemprop="streetAddress"], address');
      const address = addrEl?.innerText?.replace(/\n+/g, ' ').trim() || '';
      const phoneEl = document.querySelector('a[href^="tel:"], [class*="phone"]');
      const phone = phoneEl?.innerText?.trim() || phoneEl?.getAttribute('href')?.replace('tel:', '') || '';
      const emails = (text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [])
        .filter(e => !['cylex','google','bing','facebook','example','sentry','apple','microsoft'].some(d => e.includes(d)));
      const mailtoLinks = [...document.querySelectorAll('a[href^="mailto:"]')].map(a => a.href.replace('mailto:', ''));
      const allEmails = [...new Set([...emails, ...mailtoLinks])];
      const website = [...document.querySelectorAll('a[href^="http"]')]
        .find(a => !a.href.includes('cylex'))?.href || '';
      return { name, address, phone, emails: allEmails, website };
    });
  } catch { return null; }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    locale: 'fr-FR', timezoneId: 'Europe/Paris',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await ctx.newPage();

  const seenUrls = new Set();
  const results = [];
  const csvLines = ['\uFEFFNom;Adresse;Téléphone;Email;Site Web;Catégorie;URL Cylex'];

  console.log(`Cylex — Pantin\n${CATEGORIES.length} catégories\n`);

  for (const cat of CATEGORIES) {
    process.stdout.write(`→ "${cat}" ... `);
    const bizLinks = await scrapeCylexCategory(page, cat);

    if (bizLinks.length === 0) { console.log('0'); continue; }

    let catCount = 0;
    for (const link of bizLinks) {
      if (seenUrls.has(link)) continue;
      seenUrls.add(link);

      await page.waitForTimeout(500 + Math.random() * 500);
      const biz = await scrapeCylexBusiness(page, link);
      if (!biz || !biz.name) continue;

      // Garder seulement Pantin
      if (!/pantin|93500/i.test(biz.address + biz.name + link)) continue;

      const emailStr = biz.emails.join(' / ');
      results.push({ ...biz, category: cat, url: link });
      csvLines.push(`"${biz.name}";"${biz.address}";"${biz.phone}";"${emailStr}";"${biz.website}";"${cat}";"${link}"`);
      catCount++;

      if (biz.emails.length > 0) process.stdout.write(`✓${biz.name}(${biz.emails[0]}) `);
    }

    console.log(`${catCount} fiches`);
    await page.waitForTimeout(600 + Math.random() * 600);
  }

  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf8');
  const withEmail = results.filter(r => r.emails.length > 0).length;
  console.log(`\n✓ Terminé — ${results.length} entreprises Cylex Pantin`);
  console.log(`  📧 Avec email : ${withEmail}`);
  console.log(`  Fichier : ${OUTPUT_FILE}`);

  await browser.close();
}

main().catch(console.error);
