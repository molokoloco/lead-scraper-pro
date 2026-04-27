const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const readline = require('readline');
const path = require('path');

chromium.use(StealthPlugin());

const USER_DATA_DIR = path.join(__dirname, '..', 'chrome_scraper_profile');
const MAX_PROFILES_TO_SCRAPE = 3;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const waitManual = (msg) => new Promise(res => rl.question(`👉 ${msg}`, () => res()));

const EMAIL_BLACKLIST = ['instagram.com', 'facebook.com', 'google.com', 'bing.com',
  'example.com', 'sentry.io', 'apple.com', 'android.com', 'microsoft.com',
  'w3.org', 'schema.org', 'noreply', 'no-reply'];

function parseEmail(text) {
  const emails = (text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || []);
  return [...new Set(emails)].filter(e =>
    !EMAIL_BLACKLIST.some(d => e.toLowerCase().includes(d)) && e.length < 80
  );
}

// Accepte uniquement instagram.com/username/ sans sous-chemin
function isProfileUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('instagram.com')) return false;
    const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
    if (parts.length !== 1 || parts[0] === '') return false;
    return !/^(p|reel|reels|stories|explore|tv|highlights|accounts|login|privacy|legal|about|press|api|directory|challenge)$/i.test(parts[0]);
  } catch { return false; }
}

function filterAndLogProfiles(results, source) {
  const accepted = [];
  const rejected = [];
  for (const r of results) {
    if (isProfileUrl(r.realUrl)) {
      accepted.push(r);
    } else {
      rejected.push(r.realUrl);
    }
  }
  if (rejected.length > 0) {
    console.log(`   [${source}] ❌ Rejetés (non-profil) :`);
    rejected.forEach(u => console.log(`         - ${u}`));
  }
  console.log(`   [${source}] ✅ ${accepted.length} profil(s) valide(s) sur ${results.length} résultats`);
  return accepted;
}

async function searchGoogle(page, category, location) {
  const query = `${category} ${location} site:instagram.com`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=fr&num=20`;
  console.log(`\n🔍 [Google] Requête : "${query}"`);
  console.log(`   URL : ${url}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitManual("Résous le captcha Google si besoin, puis ENTREE...");
    await page.waitForTimeout(1500 + Math.random() * 1000);

    const raw = await page.evaluate(() => {
      return [...document.querySelectorAll('h3')].map(h3 => {
        const a = h3.closest('a') || h3.querySelector('a') || h3.parentElement?.closest('a');
        return a ? { title: h3.innerText.trim(), realUrl: a.href } : null;
      }).filter(r => r && r.realUrl && r.realUrl.includes('instagram.com/'));
    });

    console.log(`   [Google] ${raw.length} lien(s) instagram.com bruts :`);
    raw.forEach((r, i) => console.log(`      [${i + 1}] ${r.title} -> ${r.realUrl}`));

    return filterAndLogProfiles(raw, 'Google');
  } catch (err) {
    console.error(`   [Google] Erreur : ${err.message}`);
    return [];
  }
}

async function searchBing(page, category, location) {
  const query = `${category} ${location} site:instagram.com`;
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=fr&cc=FR&mkt=fr-FR&count=20`;
  console.log(`\n🔍 [Bing] Requête : "${query}"`);
  console.log(`   URL : ${url}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitManual("Résous le captcha Bing si besoin, puis ENTREE...");
    await page.waitForTimeout(1500 + Math.random() * 1000);

    const raw = await page.evaluate(() => {
      return [...document.querySelectorAll('li.b_algo h2 a')].map(a => {
        const href = a.href;
        if (href.includes('instagram.com/')) return { title: a.innerText.trim(), realUrl: href };
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

    console.log(`   [Bing] ${raw.length} lien(s) instagram.com bruts :`);
    raw.forEach((r, i) => console.log(`      [${i + 1}] ${r.title} -> ${r.realUrl}`));

    return filterAndLogProfiles(raw, 'Bing');
  } catch (err) {
    console.error(`   [Bing] Erreur : ${err.message}`);
    return [];
  }
}

async function scrapeProfile(page, profileUrl) {
  console.log(`\n   Visite : ${profileUrl}`);
  try {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000 + Math.random() * 1000);

    try { await page.click('._a9--._ap36._a9_1', { timeout: 1000 }); } catch {}

    return await page.evaluate(() => {
      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
      const ogTitle  = document.querySelector('meta[property="og:title"]')?.content  || '';
      const emails   = (metaDesc.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || []);
      const name     = ogTitle.split('(@')[0].split('•')[0].trim();
      return { name, bio: metaDesc, emails: [...new Set(emails)] };
    });
  } catch (err) {
    console.error(`   Erreur scraping : ${err.message}`);
    return null;
  }
}

async function testInstagram(category, location) {
  console.log(`\n==============================`);
  console.log(` TEST INSTAGRAM SCRAPER`);
  console.log(` Catégorie : "${category}" | Lieu : "${location}"`);
  console.log(`==============================\n`);

  const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  try {
    const page = await browser.newPage();

    // Étape 1 : Google
    let profiles = await searchGoogle(page, category, location);

    // Étape 2 : Fallback Bing si Google vide
    if (profiles.length === 0) {
      console.log(`\n⚠️  Google : 0 profil valide → fallback Bing`);
      profiles = await searchBing(page, category, location);
    }

    if (profiles.length === 0) {
      console.log(`\n❌ Aucun profil trouvé (Google + Bing)`);
      return;
    }

    console.log(`\n─────────────────────────────`);
    console.log(` Scraping des ${Math.min(MAX_PROFILES_TO_SCRAPE, profiles.length)} premiers profils`);
    console.log(`─────────────────────────────`);

    for (let i = 0; i < Math.min(MAX_PROFILES_TO_SCRAPE, profiles.length); i++) {
      const { title, realUrl } = profiles[i];
      const profileUrl = realUrl.replace(/\?.*$/, '').replace(/\/$/, '') + '/';

      console.log(`\n[${i + 1}/${Math.min(MAX_PROFILES_TO_SCRAPE, profiles.length)}] "${title}"`);
      const data = await scrapeProfile(page, profileUrl);

      if (!data) {
        console.log(`   → Échec`);
        continue;
      }

      const emails = parseEmail(data.emails.join(' ') + ' ' + data.bio);
      console.log(`   Nom   : ${data.name}`);
      console.log(`   Bio   : ${data.bio.replace(/\n/g, ' ').substring(0, 120)}...`);
      console.log(`   Emails: ${emails.length > 0 ? emails.join(', ') : '(aucun)'}`);
    }

    console.log(`\n✅ Test terminé.`);
  } finally {
    await browser.close();
    rl.close();
  }
}

const [,, catArg, locArg] = process.argv;
testInstagram(catArg || 'coiffeur', locArg || 'pantin').catch(console.error);
