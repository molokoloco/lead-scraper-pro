const { chromium } = require('playwright'); 
const fs = require('fs');
const path = require('path');
const config = require('./config');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, 'data', config.version);
const USER_DATA_DIR = path.join(__dirname, 'chrome_scraper_profile');
const CONCURRENCY = 1; 

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

/**
 * Parsing robuste des emails
 */
function parseEmails(text) {
  if (!text) return [];
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  
  return [...new Set(matches)].filter(email => {
    const lower = email.toLowerCase();
    const isBlacklisted = EMAIL_BLACKLIST.some(domain => lower.includes(domain));
    const isSystem = ['noreply', 'no-reply', 'support@', 'info@sentry'].some(s => lower.startsWith(s));
    return !isBlacklisted && !isSystem && email.length < 80 && !/\.(png|jpg|jpeg|gif|svg)$/.test(lower);
  });
}

/**
 * CSV Parser
 */
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  const header = lines[0].split(';').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.match(/(?:^|;)"((?:[^"]|"")*)"|(?:^|;)([^;]*)/g)?.map(c =>
      c.replace(/^;?"?|"?$/g, '').replace(/""/g, '"').trim()
    ) || [];
    const obj = {};
    header.forEach((h, i) => { obj[h] = cols[i] || ''; });
    return obj;
  });
}

let isFirstSearch = true;

/**
 * Recherche Google
 */
async function searchGoogle(page, query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=fr`;
  try {
    console.log(`\n🔍 Recherche Google: ${query}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    if (isFirstSearch) {
      console.log("\n🛑 PREMIÈRE RECHERCHE : Vérifie le Captcha Google.");
      await waitManual("Résous le captcha si besoin, puis appuie sur ENTREE pour lancer le mode auto...");
      isFirstSearch = false;
    }

    // Attente pour simuler lecture humaine
    await page.waitForTimeout(5000);

    return await page.evaluate(() => {
      const text = document.body.innerText;
      // 1. On cherche les liens dans les titres H3 (Résultats organiques)
      const h3Links = [...document.querySelectorAll('h3')].map(h3 => {
          const a = h3.closest('a') || h3.querySelector('a') || h3.parentElement?.closest('a');
          return a ? a.href : null;
      }).filter(h => h && h.startsWith('http') && !h.includes('google.com'));

      // 2. On complète avec TOUS les liens au cas où (fallback)
      const allLinks = [...document.querySelectorAll('a')]
        .map(el => el.href)
        .filter(h => h && h.startsWith('http') && !h.includes('google.com') && h.length > 30);

      return { text, links: [...new Set([...h3Links, ...allLinks])] };
    });
  } catch (err) {
    console.error(`  [Erreur Google] ${err.message}`);
    return { text: '', links: [] };
  }
}

/**
 * Fallback Facebook
 */
async function findEmailOnFacebook(page, businessName, location) {
  const query = `${businessName} ${location} facebook about`;
  const { links } = await searchGoogle(page, query);
  
  const fbLink = links.find(l => l.includes('facebook.com') && !l.includes('posts'));
  if (!fbLink) return [];

  try {
    let fbUrl = fbLink.split('?')[0].replace(/\/$/, '');
    
    // Gestion des deux types d'URLs Facebook
    if (fbLink.includes('profile.php')) {
      const idMatch = fbLink.match(/id=([0-9]+)/);
      if (idMatch) {
        fbUrl = `https://www.facebook.com/profile.php?id=${idMatch[1]}&sk=about`;
      }
    } else {
      fbUrl = fbUrl + '/about';
    }

    console.log(`      ↳ Facebook Found: ${fbUrl}`);
    await page.goto(fbUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000); 
    
    let text = await page.evaluate(() => document.body.innerText);
    let emails = parseEmails(text);

    // Si pas d'email, on tente la section spécifique Contact & Basic Info
    if (emails.length === 0) {
      const contactUrl = fbLink.includes('profile.php')
        ? fbUrl.replace('sk=about', 'sk=contact_info')
        : fbUrl.replace('/about', '/about_contact_and_basic_info');
      
      console.log(`      ↳ Testing Contact Info: ${contactUrl}`);
      await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2000);
      text = await page.evaluate(() => document.body.innerText);
      emails = parseEmails(text);
    }

    return emails;
  } catch (err) {
    console.error(`      [FB Error] ${err.message}`);
    return [];
  }
}

async function visitPageForEmail(page, url) {
  if (!url || url.includes('google.com')) return [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    const text = await page.evaluate(() => document.body.innerText);
    return parseEmails(text);
  } catch {
    return [];
  }
}

async function enrichOne(page, biz) {
  const name = biz['Nom'] || biz['name'] || 'Inconnu';
  const location = config.location.name;
  
  // 1. Google Search
  const { text, links } = await searchGoogle(page, `"${name}" "${location}" email contact`);

  let emails = parseEmails(text);
  
  // 2. Visit top links
  if (emails.length === 0) {
    const topLinks = links.slice(0, 3);
    for (const url of topLinks) {
      if (!url || SKIP_DOMAINS.some(d => url.includes(d))) continue;
      const found = await visitPageForEmail(page, url);
      if (found.length > 0) { emails = found; break; }
    }
  }

  // 3. Facebook Fallback
  if (emails.length === 0) {
    emails = await findEmailOnFacebook(page, name, location);
  }

  return emails;
}

async function main() {
  const arg = process.argv[2];
  let filesToProcess = [];

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (arg && arg !== 'all') {
    filesToProcess = [arg];
  } else {
    filesToProcess = fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.csv') && !f.includes('_enriched.csv'));
  }

  console.log(`🚀 Mode SÉCURISÉ GOOGLE [Version: ${config.version}]`);
  
  const browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });

  const page = await browserContext.newPage();
  
  // LOGIN MANUEL
  await page.goto("https://www.facebook.com");
  console.log("\n--- Etape 1: Facebook ---");
  await waitManual("Connecte-toi à Facebook, puis appuie sur ENTREE...");

  await page.goto("https://www.google.com");
  console.log("\n--- Etape 2: Google ---");
  await waitManual("Vérifie Google, puis appuie sur ENTREE pour lancer le scraping...");

  for (const filename of filesToProcess) {
    const inputPath = path.join(DATA_DIR, filename);
    const outputPath = path.join(DATA_DIR, filename.replace('.csv', '_enriched.csv'));
    const statePath = path.join(DATA_DIR, `${filename}.state.json`);

    if (fs.existsSync(outputPath) && !fs.existsSync(statePath)) continue;

    const rows = parseCSV(inputPath);
    if (rows.length === 0) continue;

    console.log(`\n--- [ENRICHING] ${filename} ---`);

    let startIndex = 0;
    if (fs.existsSync(statePath)) {
      startIndex = JSON.parse(fs.readFileSync(statePath, 'utf8')).lastIndex + 1;
    }

    if (startIndex === 0) {
      fs.writeFileSync(outputPath, '\uFEFFNom;Adresse;Téléphone;Email;Catégorie;Source\n', 'utf8');
    }

    for (let i = startIndex; i < rows.length; i++) {
      const biz = rows[i];
      const name = biz['Nom'] || biz['name'] || 'Inconnu';
      
      process.stdout.write(`[${i + 1}/${rows.length}] ${name} ... `);

      try {
        const emails = await enrichOne(page, biz);
        const emailStr = emails.join(',');

        console.log(emails.length ? `✓ ${emails[0]}` : `—`);

        const csvLine = [
          `"${name}"`,
          `"${biz['Adresse'] || biz['address'] || ''}"`,
          `"${biz['Téléphone'] || biz['phone'] || ''}"`,
          `"${emailStr}"`,
          `"${biz['Catégorie'] || biz['cat'] || ''}"`,
          `"${biz['Source'] || filename}"`
        ].join(';');

        fs.appendFileSync(outputPath, csvLine + '\n', 'utf8');
        fs.writeFileSync(statePath, JSON.stringify({ lastIndex: i }), 'utf8');

      } catch (err) {
        console.error(`❌ Erreur:`, err.message);
      }

      // PAUSE DE SÉCURITÉ ALÉATOIRE (15-40 secondes)
      const delay = Math.floor(Math.random() * (40000 - 15000 + 1) + 15000);
      console.log(`☕ Pause de ${Math.round(delay/1000)} secondes...`);
      await page.waitForTimeout(delay);
    }

    if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
  }

  console.log('\n✨ TRAVAIL TERMINÉ. La fenêtre reste ouverte.');
}

main().catch(console.error);
