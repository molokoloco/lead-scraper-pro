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

async function testGoogle(name, location) {
  console.log(`\n🚀 Test Google Enrichment — profil: ${USER_DATA_DIR}`);
  console.log(`   Cible : "${name}" / "${location}"\n`);

  const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  try {
    const page = await browser.newPage();
    const query = `"${name}" "${location}" email contact`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=fr`;

    console.log(`🔍 Requête : ${query}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitManual('Résous le captcha si besoin, puis appuie sur ENTREE...');
    await page.waitForTimeout(3000);

    const { text, links } = await page.evaluate(() => {
      const text = document.body.innerText;

      const h3Links = [...document.querySelectorAll('h3')].map(h3 => {
        const a = h3.closest('a') || h3.querySelector('a') || h3.parentElement?.closest('a');
        return a ? a.href : null;
      }).filter(h => h && h.startsWith('http') && !((hn=>hn.endsWith('.google')||hn.includes('.google.'))(new URL(h).hostname)));

      const allLinks = [...document.querySelectorAll('a')]
        .map(el => el.href)
        .filter(h => h && h.startsWith('http') && !((hn=>hn.endsWith('.google')||hn.includes('.google.'))(new URL(h).hostname)) && h.length > 30);

      return { text, links: [...new Set([...h3Links, ...allLinks])] };
    });

    const emails = parseEmails(text);
    const phones = parsePhones(text);
    const fbLink = links.find(l => l.includes('facebook.com'));

    console.log(`\n📊 Résultats depuis le texte de la page Google :`);
    console.log(`   📧 Emails   : ${emails.length ? emails.join(', ') : '—'}`);
    console.log(`   📞 Téléphones: ${phones.length ? phones.join(', ') : '—'}`);
    console.log(`   👍 Facebook  : ${fbLink || '—'}`);

    console.log(`\n🔗 Top 10 liens organiques :`);
    links.slice(0, 10).forEach((l, i) => console.log(`   [${i + 1}] ${l}`));

    await waitManual('\nAppuie sur ENTREE pour fermer...');
  } finally {
    await browser.close();
    rl.close();
  }
}

const [,, nameArg, locationArg] = process.argv;
testGoogle(
  nameArg || 'FIT BARBER CUT',
  locationArg || config.location.name
).catch(console.error);
