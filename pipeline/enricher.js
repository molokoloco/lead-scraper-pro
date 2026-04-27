const { chromium } = require('playwright'); 
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, '..', 'data', config.version);
const USER_DATA_DIR = path.join(__dirname, '..', 'chrome_scraper_profile');
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
function parsePhones(text) {
  if (!text) return [];
  const matches = text.match(/(?:\+33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/g) || [];
  return [...new Set(matches)];
}

function parseEmails(text) {
  if (!text) return [];
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  
  return [...new Set(matches)].filter(email => {
    const lower = email.toLowerCase();
    const isBlacklisted = EMAIL_BLACKLIST.some(domain => lower.includes(domain));
    const isSystem = ['noreply', 'no-reply', 'support@', 'info@sentry'].some(s => lower.startsWith(s));
    const isPlaceholder = /^(nom|prenom|nom\.prenom|prenom\.nom|nomprenom|prenomprenom|email|webmaster|admin)@(domaine|domain|exemple|example|entreprise|societe|société|site|web)\./i;
    return !isBlacklisted && !isSystem && !isPlaceholder.test(lower) && email.length < 80 && !/\.(png|jpg|jpeg|gif|svg)$/.test(lower);
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

  const header = lines[0].split(';').map(h => h.trim().replace(/[\x00-\x1F\x7F]/g, ''));
  return lines.slice(1).map(line => {
    const cols = line.match(/(?:^|;)"((?:[^"]|"")*)"|(?:^|;)([^;]*)/g)?.map(c =>
      c.replace(/^;?"?|"?$/g, '').replace(/""/g, '"').trim()
    ) || [];
    const obj = {};
    header.forEach((h, i) => { obj[h] = cols[i] || ''; });
    return obj;
  });
}
function getPhoneFromBiz(biz) {
  return biz['Téléphone(s)'] || biz['Téléphone'] || biz['phone'] || biz['phoneNumber'] || '';
}

function cleanWebsite(url) {
  if (!url) return '';
  const normalized = url.trim();
  const lower = normalized.toLowerCase();
  if (!lower.startsWith('http')) return '';
  if (lower.includes('google.com/maps') || lower.includes('maps.google.com') || lower.includes('google.com/search')) return '';
  if (lower.includes('pagesjaunes.fr') || lower.includes('facebook.com') || lower.includes('instagram.com') || lower.includes('tripadvisor.com') || lower.includes('yelp.com')) return '';
  return normalized;
}

function getSiteFromBiz(biz) {
  const fields = [
    biz['Site Web'],
    biz['site web'],
    biz['website'],
    biz['URL'],
    biz['URL Planity'],
    biz['URL Cylex'],
    biz['url'],
    biz['site']
  ];
  for (const field of fields) {
    const cleaned = cleanWebsite(field);
    if (cleaned) return cleaned;
  }
  return '';
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
      }).filter(h => h && h.startsWith('http') && !((hn=>hn.endsWith('.google')||hn.includes('.google.'))(new URL(h).hostname)));

      // 2. On complète avec TOUS les liens au cas où (fallback)
      const allLinks = [...document.querySelectorAll('a')]
        .map(el => el.href)
        .filter(h => h && h.startsWith('http') && !((hn=>hn.endsWith('.google')||hn.includes('.google.'))(new URL(h).hostname)) && h.length > 30);

      return { text, links: [...new Set([...h3Links, ...allLinks])] };
    });
  } catch (err) {
    console.error(`  [Erreur Google] ${err.message}`);
    return { text: '', links: [] };
  }
}

/**
 * Extrait l'URL de base du profil Facebook depuis n'importe quel lien FB
 * Gère : /username, /pages/Name/ID, profile.php?id=, sous-pages /photos /videos etc.
 */
function getFBProfileBase(url) {
  try {
    const u = new URL(url);
    // profile.php?id=xxx
    if (u.pathname.includes('profile.php')) {
      const id = u.searchParams.get('id');
      return id ? `https://www.facebook.com/profile.php?id=${id}` : null;
    }
    const parts = u.pathname.split('/').filter(Boolean);
    // /pages/BusinessName/123456789[/subpage...]
    if (parts[0] === 'pages' && parts.length >= 3) {
      return `https://www.facebook.com/pages/${parts[1]}/${parts[2]}`;
    }
    // /username[/subpage...]  — mais pas si c'est juste "pages" sans ID, ni sharer.php
    if (parts[0] && parts[0] !== 'pages' && !parts[0].includes('sharer') && !parts[0].includes('share')) {
      return `https://www.facebook.com/${parts[0]}`;
    }
    return null;
  } catch { return null; }
}

/**
 * Fallback Facebook
 */
/**
 * Visite un profil FB connu et extrait emails/phones/site
 */
async function extractFromFBProfile(page, fbLink) {
  try {
    const profileBase = getFBProfileBase(fbLink);
    if (!profileBase) return { emails: [], phones: [], site: '' };

    const fbUrl = profileBase.includes('profile.php')
      ? `${profileBase}&sk=about`
      : `${profileBase}/about`;

    console.log(`      ↳ Facebook: ${fbUrl}`);
    await page.goto(fbUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    let { text, fbLinks } = await page.evaluate(() => ({
      text: document.body.innerText,
      fbLinks: [...document.querySelectorAll('a[href]')].map(a => a.href)
    }));
    let emails = parseEmails(text);
    let phones = parsePhones(text);
    let site = firstValidLink(fbLinks);

    // Si incomplet, tente les URLs de contact (profil perso ET page pro)
    if (emails.length === 0 && phones.length === 0 && !site) {
      const contactUrls = profileBase.includes('profile.php')
        ? [`${profileBase}&sk=contact_info`]
        : [`${profileBase}/about_contact_and_basic_info`, `${profileBase}/directory_contact_info`];

      for (const contactUrl of contactUrls) {
        console.log(`      ↳ Testing: ${contactUrl}`);
        await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(2000);
        ({ text, fbLinks } = await page.evaluate(() => ({
          text: document.body.innerText,
          fbLinks: [...document.querySelectorAll('a[href]')].map(a => a.href)
        })));
        emails = parseEmails(text);
        phones = parsePhones(text);
        site = firstValidLink(fbLinks);
        if (emails.length > 0 || phones.length > 0 || site) break;
      }
    }

    return { emails, phones, site };
  } catch (err) {
    console.error(`      [FB Error] ${err.message}`);
    return { emails: [], phones: [], site: '' };
  }
}

async function findEmailOnFacebook(page, businessName) {
  const query = `"${businessName}" site:facebook.com`;
  const { links } = await searchGoogle(page, query);

  const fbLink = links.find(l => l.includes('facebook.com') && !l.includes('posts'));
  if (!fbLink) return { emails: [], phones: [], site: '' };

  try {
    return await extractFromFBProfile(page, fbLink);
  } catch (err) {
    console.error(`      [FB Error] ${err.message}`);
    return { emails: [], phones: [], site: '' };
  }
}

function firstValidLink(links) {
  return links.find(url => url && !SKIP_DOMAINS.some(d => url.includes(d)) && cleanWebsite(url)) || '';
}

async function visitPage(page, url) {
  if (!url || url.includes('google.com')) return { emails: [], phones: [], fbLink: '' };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    const { text, links } = await page.evaluate(() => ({
      text: document.body.innerText,
      links: [...document.querySelectorAll('a[href*="facebook.com"]')].map(a => a.href)
    }));
    // Extraire le premier lien FB qui pointe vers un profil (pas une URL générique)
    const fbLink = links.find(h => {
      const path = new URL(h).pathname.split('/').filter(Boolean);
      return path.length >= 1 && !path[0].includes('sharer') && !path[0].includes('share') && path[0] !== 'plugins';
    }) || '';
    return { emails: parseEmails(text), phones: parsePhones(text), fbLink };
  } catch {
    return { emails: [], phones: [], fbLink: '' };
  }
}

async function enrichOne(page, biz) {
  const name = biz['Nom'] || biz['name'] || '';
  const location = config.location.name;
  const hasPhone = !!getPhoneFromBiz(biz);
  const hasSite = !!getSiteFromBiz(biz);

  // 1. Google Search — skip si pas de nom
  if (!name) return { emails: [], phones: [], site: '' };
  const { text, links } = await searchGoogle(page, `"${name}" "${location}" email contact`);

  let emails = parseEmails(text);
  let phones = hasPhone ? [] : parsePhones(text);
  let site = hasSite ? '' : firstValidLink(links);

  // Lien FB fiable : depuis la source (PagesJaunes) ou depuis le site de l'entreprise
  let knownFbLink = biz['Facebook'] || '';

  // 2. Visit top links — on collecte aussi les liens FB trouvés sur leur site
  if (emails.length === 0 || (!hasPhone && phones.length === 0) || !knownFbLink) {
    const topLinks = links.slice(0, 3);
    for (const url of topLinks) {
      if (!url || SKIP_DOMAINS.some(d => url.includes(d))) continue;
      const found = await visitPage(page, url);
      if (emails.length === 0 && found.emails.length > 0) emails = found.emails;
      if (!hasPhone && phones.length === 0 && found.phones.length > 0) phones = found.phones;
      if (!knownFbLink && found.fbLink) knownFbLink = found.fbLink;
      if (emails.length > 0 && (hasPhone || phones.length > 0) && knownFbLink) break;
    }
  }

  // 3. Facebook — seulement si on a un lien fiable (PagesJaunes ou site perso)
  if (knownFbLink && (emails.length === 0 || (!hasPhone && phones.length === 0) || (!hasSite && !site))) {
    console.log(`      ↳ FB link fiable trouvé: ${knownFbLink}`);
    const fb = await extractFromFBProfile(page, knownFbLink);
    if (emails.length === 0) emails = fb.emails;
    if (!hasPhone && phones.length === 0) phones = fb.phones;
    if (!hasSite && !site && fb.site) site = fb.site;
  }

  return { emails, phones, site };
}

function cleanupOldEnrichedFiles() {
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('_enriched.csv') && f !== 'results_final_enriched.csv');

  if (files.length === 0) return;
  console.log('🧹 Nettoyage des anciens fichiers enrichis...');
  files.forEach(file => {
    try {
      fs.unlinkSync(path.join(DATA_DIR, file));
      console.log(`   ✂️ ${file}`);
    } catch (err) {
      console.warn(`   ⚠️ Impossible de supprimer ${file} : ${err.message}`);
    }
  });
}

async function main() {
  const arg = process.argv[2];
  let filesToProcess = [];

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!arg || arg === 'all') {
    console.log('🔀 Merge d abord, puis enrichissement du fichier fusionné.');
    try {
      execSync(`node "${path.join(__dirname, 'merge.js')}"`, { stdio: 'inherit' });
    } catch (err) {
      console.error('❌ Échec du merge :', err.message);
      process.exit(1);
    }

    filesToProcess = ['results_final.csv'];
  } else {
    filesToProcess = [arg];
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

    const rows = parseCSV(inputPath);
    if (rows.length === 0) continue;

    // Skip only if enriched file has as many data rows as input (truly complete)
    if (fs.existsSync(outputPath) && !fs.existsSync(statePath)) {
      const enrichedLines = fs.readFileSync(outputPath, 'utf8').split('\n').filter(l => l.trim()).length - 1;
      if (enrichedLines >= rows.length) continue;
    }

    console.log(`\n--- [ENRICHING] ${filename} ---`);

    let startIndex = 0;
    if (fs.existsSync(statePath)) {
      startIndex = JSON.parse(fs.readFileSync(statePath, 'utf8')).lastIndex + 1;
    }

    if (startIndex === 0) {
      fs.writeFileSync(outputPath, '\uFEFFNom;Adresse;Téléphone;Site Web;Email;Facebook;Catégorie;Source\n', 'utf8');
    }

    for (let i = startIndex; i < rows.length; i++) {
      const biz = rows[i];
      const name = biz['Nom'] || biz['name'] || '';
      if (!name) { console.log(`[${i + 1}/${rows.length}] ⚠️ Nom manquant, ligne ignorée`); continue; }

      process.stdout.write(`[${i + 1}/${rows.length}] ${name} ... `);

      try {
        const { emails, phones, site } = await enrichOne(page, biz);
        const emailStr = emails.join(',');
        const phone = getPhoneFromBiz(biz) || phones[0] || '';
        const website = getSiteFromBiz(biz) || site || '';

        const found = [
          emails.length ? `📧 ${emails.join(', ')}` : '',
          !getPhoneFromBiz(biz) && phones[0] ? `📞 ${phones[0]}` : '',
          !getSiteFromBiz(biz) && site ? `🌐 ${site}` : ''
        ].filter(Boolean);
        console.log(found.length ? found.join(' | ') : `—`);

        const facebook = biz['Facebook'] || '';
        const csvLine = [
          `"${name}"`,
          `"${biz['Adresse'] || biz['address'] || ''}"`,
          `"${phone}"`,
          `"${website}"`,
          `"${emailStr}"`,
          `"${facebook}"`,
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

  if (!process.argv[2] || process.argv[2] === 'all') {
    cleanupOldEnrichedFiles();
  }

  console.log('\n✨ TRAVAIL TERMINÉ. La fenêtre reste ouverte.');
}

main().catch(console.error);
