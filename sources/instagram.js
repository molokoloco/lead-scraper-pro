const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const config = require('../config');

chromium.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '..', 'data', config.version, 'instagram_results.csv');

const CATEGORIES = config.categories;
const LOCATION = config.location.name;

const EMAIL_BLACKLIST = ['instagram.com', 'facebook.com', 'google.com', 'bing.com',
  'example.com', 'sentry.io', 'apple.com', 'android.com', 'microsoft.com',
  'w3.org', 'schema.org', 'noreply', 'no-reply'];

function parseEmail(text) {
  const emails = (text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || []);
  return [...new Set(emails)].filter(e =>
    !EMAIL_BLACKLIST.some(d => e.toLowerCase().includes(d)) && e.length < 80
  );
}

function decodeBingUrl(href) {
  const match = href.match(/[?&]u=a1([A-Za-z0-9+/=_-]+)/);
  if (!match) return null;
  try {
    // Bing utilise base64 URL-safe
    const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    return atob(b64);
  } catch { return null; }
}

function isPantin(text) {
  return /pantin|93500/i.test(text);
}

async function searchGoogleInstagram(page, category) {
  const query = `${category} ${LOCATION} site:instagram.com`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=fr&num=20`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500 + Math.random() * 1000);

    return await page.evaluate(() => {
      return [...document.querySelectorAll('h3')].map(h3 => {
        const a = h3.closest('a') || h3.querySelector('a') || h3.parentElement?.closest('a');
        return a ? { title: h3.innerText.trim(), realUrl: a.href } : null;
      }).filter(r => r && r.realUrl && r.realUrl.includes('instagram.com/'));
    });
  } catch { return []; }
}

async function searchBingInstagram(page, category) {
  const query = `${category} ${LOCATION} site:instagram.com`;
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=fr&cc=FR&mkt=fr-FR&count=20`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500 + Math.random() * 1000);

    return await page.evaluate(() => {
      return [...document.querySelectorAll('li.b_algo h2 a')].map(a => {
        const href = a.href;
        // Liens directs instagram.com
        if (href.includes('instagram.com/')) return { title: a.innerText.trim(), realUrl: href };
        // Liens encodés Bing (u=a1...)
        const match = href.match(/[?&]u=a1([A-Za-z0-9+/=_-]+)/);
        if (match) {
          try {
            const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
            const realUrl = atob(b64);
            if (realUrl.includes('instagram.com/')) return { title: a.innerText.trim(), realUrl };
          } catch(e) {}
        }
        return null;
      }).filter(Boolean);
    });
  } catch { return []; }
}

async function searchInstagramProfiles(page, category) {
  // 1. Google en priorité (plus fiable pour site:instagram.com)
  const googleResults = await searchGoogleInstagram(page, category);
  if (googleResults.length > 0) return googleResults;

  // 2. Fallback Bing
  console.log(`      ↳ Google: 0 résultat, fallback Bing...`);
  return await searchBingInstagram(page, category);
}

async function scrapeInstagramProfile(page, profileUrl) {
  try {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    return await page.evaluate(() => {
      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
      const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';

      // Email dans meta description (bio Instagram)
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const emails = (metaDesc.match(emailRegex) || []);

      // Extraire nom, followers depuis meta
      // Format: "X Followers, Y Following, Z Posts - NOM (@handle) on Instagram: "bio""
      const nameMatch = metaDesc.match(/Posts - (.+?) \(@/);
      const name = nameMatch ? nameMatch[1].trim() : ogTitle.replace(' • Instagram', '').trim();
      const bioMatch = metaDesc.match(/on Instagram: [""](.+?)[""]$/s);
      const bio = bioMatch ? bioMatch[1].trim() : metaDesc;

      return { name, bio, emails, metaDesc };
    });
  } catch { return null; }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'fr-FR', timezoneId: 'Europe/Paris',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const seenUrls = new Set();
  const results = [];
  const csvLines = ['\uFEFFNom Instagram;Handle;Bio;Email;Catégorie;URL'];

  console.log(`Scraping Instagram — Pantin 93\n${CATEGORIES.length} catégories\n`);

  for (const cat of CATEGORIES) {
    process.stdout.write(`→ "${cat}" ... `);
    let catCount = 0;

    const profiles = await searchInstagramProfiles(page, cat);

    for (const { title, realUrl } of profiles) {
      // Nettoyer l'URL (garder juste le profil racine)
      const profileUrl = realUrl.replace(/\?.*$/, '').replace(/\/$/, '') + '/';
      if (seenUrls.has(profileUrl)) continue;
      seenUrls.add(profileUrl);

      await page.waitForTimeout(600 + Math.random() * 600);
      const data = await scrapeInstagramProfile(page, profileUrl);
      if (!data) continue;

      // Filtrer sur Pantin dans la bio
      if (!isPantin(data.bio) && !isPantin(title)) continue;

      const handle = profileUrl.replace('https://www.instagram.com/', '').replace('/', '');
      const emails = parseEmail(data.emails.join(' ') + ' ' + data.bio);

      const row = {
        name: data.name || title,
        handle,
        bio: data.bio.replace(/\n/g, ' ').substring(0, 200),
        emails: emails.join(' / '),
        category: cat,
        url: profileUrl
      };

      results.push(row);
      csvLines.push(`"${row.name}";"${row.handle}";"${row.bio}";"${row.emails}";"${row.category}";"${row.url}"`);
      catCount++;

      if (emails.length > 0) {
        process.stdout.write(`✓ ${data.name} (${emails.join(', ')}) `);
      }
    }

    console.log(`→ ${catCount} profils Pantin`);
    await page.waitForTimeout(1000 + Math.random() * 800);
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf8');
  const withEmail = results.filter(r => r.emails).length;
  console.log(`\n✓ Terminé — ${results.length} profils Instagram Pantin`);
  console.log(`  dont ${withEmail} avec email`);
  console.log(`  Fichier : ${OUTPUT_FILE}`);

  await browser.close();
}

main().catch(console.error);
