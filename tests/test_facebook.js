const { chromium } = require('playwright');
const readline = require('readline');
const path = require('path');
const config = require('../config');

const USER_DATA_DIR = path.join(__dirname, '..', 'chrome_scraper_profile');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const waitManual = (msg) => new Promise(res => rl.question(`👉 ${msg}`, () => res()));

const EMAIL_BLACKLIST = [
  'google.com', 'facebook.com', 'bing.com', 'microsoft.com', 'instagram.com',
  'pagesjaunes.fr', 'example.com', 'sentry.io', 'wixpress.com', 'w3.org',
  'schema.org', 'jquery.com', 'goo.gl', 'bit.ly', 'apple.com', 'android.com',
  'openstreetmap.org', 'gravatar.com', 'wp.com', 'wordpress.org'
];

const SKIP_DOMAINS = [
  'google.com', 'facebook.com', 'instagram.com', 'pagesjaunes.fr', 'planity.com',
  'youtube.com', 'twitter.com', 'societe.com', 'infogreffe.fr', 'linkedin.com',
  'tripadvisor.fr', 'yelp.fr', 'annuaire-mairie.fr'
];

function parsePhones(text) {
  if (!text) return [];
  return [...new Set(text.match(/(?:\+33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/g) || [])];
}

function parseEmails(text) {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
  return [...new Set(matches)].filter(email => {
    const lower = email.toLowerCase();
    return !EMAIL_BLACKLIST.some(d => lower.includes(d))
      && !['noreply', 'no-reply', 'support@', 'info@sentry'].some(s => lower.startsWith(s))
      && email.length < 80
      && !/\.(png|jpg|jpeg|gif|svg)$/.test(lower);
  });
}

function cleanWebsite(url) {
  if (!url) return '';
  const lower = url.trim().toLowerCase();
  if (!lower.startsWith('http')) return '';
  if (SKIP_DOMAINS.some(d => lower.includes(d))) return '';
  return url.trim();
}

function firstValidLink(links) {
  return links.find(url => cleanWebsite(url)) || '';
}

function getFBProfileBase(url) {
  try {
    const u = new URL(url);
    if (u.pathname.includes('profile.php')) {
      const id = u.searchParams.get('id');
      return id ? `https://www.facebook.com/profile.php?id=${id}` : null;
    }
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'pages' && parts.length >= 3) {
      return `https://www.facebook.com/pages/${parts[1]}/${parts[2]}`;
    }
    if (parts[0] && parts[0] !== 'pages') {
      return `https://www.facebook.com/${parts[0]}`;
    }
    return null;
  } catch { return null; }
}

async function searchGoogleForFB(page, query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=fr`;
  console.log(`\n🔍 Google : ${query}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  return page.evaluate(() => {
    const h3Links = [...document.querySelectorAll('h3')].map(h3 => {
      const a = h3.closest('a') || h3.querySelector('a') || h3.parentElement?.closest('a');
      return a ? a.href : null;
    }).filter(h => h && h.startsWith('http') && !h.includes('google.com'));

    const allLinks = [...document.querySelectorAll('a')]
      .map(el => el.href)
      .filter(h => h && h.startsWith('http') && !h.includes('google.com') && h.length > 30);

    return [...new Set([...h3Links, ...allLinks])];
  });
}

async function testFacebook(name, location) {
  console.log(`\n🚀 Test Facebook Enrichment — profil: ${USER_DATA_DIR}`);
  console.log(`   Cible : "${name}" / "${location}"\n`);

  const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  try {
    const page = await browser.newPage();

    // Étape 1 : connexion Facebook
    await page.goto('https://www.facebook.com');
    await waitManual('Connecte-toi à Facebook si besoin, puis appuie sur ENTREE...');

    // Étape 2 : trouver la page FB via Google
    const links = await searchGoogleForFB(page, `"${name}" site:facebook.com`);
    const fbLink = links.find(l => l.includes('facebook.com') && !l.includes('posts'));

    if (!fbLink) {
      console.log('❌ Aucune page Facebook trouvée dans les résultats Google.');
      console.log('   Liens bruts (10 premiers) :', links.slice(0, 10));
      await waitManual('Appuie sur ENTREE pour fermer...');
      return;
    }

    console.log(`\n✅ Page Facebook trouvée : ${fbLink}`);

    // Étape 3 : extraire la base du profil (ignorer /photos/xxx, /videos/xxx, /pages sans ID, etc.)
    const profileBase = getFBProfileBase(fbLink);

    if (!profileBase) {
      console.log('❌ Impossible d\'extraire la base du profil Facebook.');
      await waitManual('Appuie sur ENTREE pour fermer...');
      return;
    }

    const fbUrl = profileBase.includes('profile.php')
      ? `${profileBase}&sk=about`
      : `${profileBase}/about`;

    console.log(`🚀 Navigation → ${fbUrl}`);
    await page.goto(fbUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    let { text, pageLinks } = await page.evaluate(() => ({
      text: document.body.innerText,
      pageLinks: [...document.querySelectorAll('a[href]')].map(a => a.href)
    }));

    let emails = parseEmails(text);
    let phones = parsePhones(text);
    let site = firstValidLink(pageLinks);

    console.log(`\n📊 Résultats depuis /about :`);
    console.log(`   📧 Emails    : ${emails.length ? emails.join(', ') : '—'}`);
    console.log(`   📞 Téléphones: ${phones.length ? phones.join(', ') : '—'}`);
    console.log(`   🌐 Site Web  : ${site || '—'}`);

    // Étape 4 : fallback contact_info si vide (profil perso OU page pro)
    if (emails.length === 0 && phones.length === 0 && !site) {
      const contactUrls = profileBase.includes('profile.php')
        ? [`${profileBase}&sk=contact_info`]
        : [`${profileBase}/about_contact_and_basic_info`, `${profileBase}/directory_contact_info`];

      for (const contactUrl of contactUrls) {
        console.log(`\n↳ Tentative : ${contactUrl}`);
        await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(2000);

        ({ text, pageLinks } = await page.evaluate(() => ({
          text: document.body.innerText,
          pageLinks: [...document.querySelectorAll('a[href]')].map(a => a.href)
        })));

        emails = parseEmails(text);
        phones = parsePhones(text);
        site = firstValidLink(pageLinks);

        console.log(`   📧 Emails    : ${emails.length ? emails.join(', ') : '—'}`);
        console.log(`   📞 Téléphones: ${phones.length ? phones.join(', ') : '—'}`);
        console.log(`   🌐 Site Web  : ${site || '—'}`);
        if (emails.length > 0 || phones.length > 0 || site) break;
      }
    }

    await waitManual('\nAppuie sur ENTREE pour fermer...');
  } finally {
    await browser.close();
    rl.close();
  }
}

const [,, nameArg, locationArg] = process.argv;
testFacebook(
  nameArg || 'FIT BARBER CUT',
  locationArg || config.location.name
).catch(console.error);
