const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const config = require('../config');
chromium.use(StealthPlugin());

const USER_DATA_DIR = path.join(__dirname, '..', 'chrome_scraper_profile');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', config.version, 'cylex_results.csv');
const CATEGORIES = config.categories;
const LOCATION_NAME = config.location.name;
const CITY = LOCATION_NAME.toLowerCase().split(' ')[0];
const LOCATION_REGEX = new RegExp(config.location.keywords.join('|'), 'i');

const EMAIL_BL = ['cylex','google','bing','facebook','example','sentry','apple','microsoft','w3.org'];

function parseEmail(text) {
  return [...new Set(text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [])]
    .filter(e => !EMAIL_BL.some(d => e.includes(d)) && e.length < 80);
}

function toSlug(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

async function scrapeCylexCategory(page, category) {
  const url = `https://www.cylex-locale.fr/${CITY}/${toSlug(category)}.html`;
  console.log(`      [Cylex] URL: ${url}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      bodyLen: document.body.innerText.length,
      allLinks: [...document.querySelectorAll('a[href]')].map(a => a.href).slice(0, 8)
    }));
    console.log(`      [Cylex] title="${pageInfo.title}" url=${pageInfo.url} bodyLen=${pageInfo.bodyLen}`);
    console.log(`      [Cylex] liens bruts: ${pageInfo.allLinks.join(' | ')}`);

    if (pageInfo.title.includes('404') || pageInfo.bodyLen < 200) { console.log(`      [Cylex] Page vide/404`); return []; }

    const businessLinks = pageInfo.allLinks.filter(h => h.includes('/entreprises/'));
    return [...new Set(businessLinks)];
  } catch (err) { console.log(`      [Cylex] Erreur: ${err.message}`); return []; }
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
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const page = await ctx.newPage();

  const seenUrls = new Set();
  const results = [];
  const csvLines = ['\uFEFFNom;Adresse;Téléphone;Email;Site Web;Catégorie;URL Cylex'];

  console.log(`Cylex — ${LOCATION_NAME}\n${CATEGORIES.length} catégories\n`);

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
      if (!biz || !biz.name) { console.log(`      [Cylex] Fiche vide: ${link}`); continue; }

      if (!LOCATION_REGEX.test(biz.address + biz.name + link)) {
        console.log(`      [Cylex] Filtré (hors zone): "${biz.name}" | addr: "${biz.address}"`);
        continue;
      }

      const emailStr = biz.emails.join(' / ');
      results.push({ ...biz, category: cat, url: link });
      csvLines.push(`"${biz.name}";"${biz.address}";"${biz.phone}";"${emailStr}";"${biz.website}";"${cat}";"${link}"`);
      catCount++;

      if (biz.emails.length > 0) process.stdout.write(`✓${biz.name}(${biz.emails[0]}) `);
    }

    console.log(`${catCount} fiches`);
    await page.waitForTimeout(600 + Math.random() * 600);
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf8');
  const withEmail = results.filter(r => r.emails.length > 0).length;
  console.log(`\n✓ Terminé — ${results.length} entreprises Cylex ${LOCATION_NAME}`);
  console.log(`  📧 Avec email : ${withEmail}`);
  console.log(`  Fichier : ${OUTPUT_FILE}`);

  await ctx.close();
}

main().catch(console.error);
