const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const CATEGORIES = config.categories;
const LOCATION = config.location.name;
const LOCATION_KEYWORDS = config.location.keywords;
const OUTPUT_FILE = path.join(__dirname, '..', 'data', config.version, 'pagesjaunes_results.csv');
const MAX_PAGES_PER_CAT = 5;

function buildUrl(category, pageNum = 1) {
  const q = encodeURIComponent(category);
  const loc = encodeURIComponent(LOCATION);
  return `https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=${q}&ou=${loc}&proximite=0&page=${pageNum}`;
}

function isInLocation(address) {
  const lower = address.toLowerCase();
  return LOCATION_KEYWORDS.some(k => lower.includes(k));
}

async function scrapePage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000 + Math.random() * 500);

  const noResult = await page.$('.zero-result, .no-result, [class*="no-result"]');
  if (noResult) return { items: [], hasMore: false };

  const items = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('li.bi')];
    return cards.map(card => {
      // Nom
      const name = card.querySelector('h3')?.innerText?.trim() || '';

      // Adresse
      const address = card.querySelector('.bi-address, [class*="address"]')?.innerText
        ?.replace('Voir le plan', '').trim() || '';

      // Téléphone depuis div#bi-fantomas
      const id = card.id?.replace('epj-', '') || card.querySelector('[id^="bi-fantomas"]')?.id?.replace('bi-fantomas-', '');
      let phones = [];
      if (id) {
        const fantomas = document.querySelector(`#bi-fantomas-${id}`);
        if (fantomas) {
          phones = [...fantomas.querySelectorAll('.number-contact')]
            .map(el => (el.innerText.match(/(?:\+33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/) || [])[0] || '')
            .filter(Boolean);
        }
      }
      // Fallback : chercher ancre id dans la carte
      const ancre = card.querySelector('.ancre-google');
      if (!phones.length && ancre) {
        const epjId = ancre.id?.replace('epj-', '');
        const fantomas2 = document.querySelector(`#bi-fantomas-${epjId}`);
        if (fantomas2) {
          phones = [...fantomas2.querySelectorAll('.number-contact')]
            .map(el => (el.innerText.match(/(?:\+33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/) || [])[0] || '')
            .filter(Boolean);
        }
      }

      // Activité
      const activity = card.querySelector('.bi-activity-unit, [class*="activit"]')?.innerText?.trim() || '';

      // Site web : liens externes (pas PagesJaunes, pas Google Maps, pas tel:, pas réseaux sociaux)
      const websiteLink = [...card.querySelectorAll('a[href^="http"]')]
        .find(a => {
          const href = a.href.toLowerCase();
          return !href.includes('pagesjaunes.fr')
            && !href.startsWith('tel:')
            && !href.includes('google.com/maps')
            && !href.includes('maps.google.com')
            && !href.includes('google.com/search')
            && !href.includes('facebook.com')
            && !href.includes('instagram.com')
            && !href.includes('twitter.com')
            && !href.includes('linkedin.com')
            && !href.includes('tripadvisor.com')
            && !href.includes('yelp.com');
        });
      const website = websiteLink?.href || '';

      // Lien Facebook direct si présent sur la fiche
      const fbLink = [...card.querySelectorAll('a[href*="facebook.com"]')]
        .map(a => a.href)
        .find(h => h.includes('facebook.com') && !h.includes('pagesjaunes'));
      const facebook = fbLink || '';

      return { name, address, phones, activity, website, facebook };
    }).filter(r => r.name);
  });

  // Vérifier s'il y a une page suivante
  const hasMore = await page.$('.pagination .page-item.active + .page-item:not(.disabled)') !== null;

  return { items, hasMore };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'fr-FR',
  });
  const page = await context.newPage();

  // Dédoublonnage par nom+adresse
  const seen = new Set();
  const allResults = [];

  const csvLines = ['Nom;Adresse;Téléphone;Site Web;Facebook;Catégorie;Activité'];

  console.log(`Scraping Pages Jaunes — ${LOCATION}`);
  console.log(`${CATEGORIES.length} catégories\n`);

  for (const cat of CATEGORIES) {
    process.stdout.write(`→ "${cat}" ... `);
    let catCount = 0;

    for (let p = 1; p <= MAX_PAGES_PER_CAT; p++) {
      try {
        const { items, hasMore } = await scrapePage(page, buildUrl(cat, p));

        for (const item of items) {
          // Filtrer : uniquement la ville ciblée
          if (!isInLocation(item.address)) continue;

          // Dédoublonner
          const key = `${item.name}|${item.address}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const phoneStr = item.phones.join(' / ');
          csvLines.push(`"${item.name}";"${item.address}";"${phoneStr}";"${item.website}";"${item.facebook}";"${cat}";"${item.activity}"`);
          allResults.push({ ...item, searchCategory: cat });
          catCount++;
        }

        if (!hasMore) break;
        await page.waitForTimeout(700 + Math.random() * 600);
      } catch (err) {
        process.stdout.write(`[err: ${err.message.substring(0, 40)}]`);
        break;
      }
    }

    console.log(`${catCount} résultats ${LOCATION}`);
    await page.waitForTimeout(800 + Math.random() * 800);
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf8');

  console.log(`\n✓ Terminé — ${allResults.length} entreprises exportées`);
  console.log(`  Fichier : ${OUTPUT_FILE}`);

  await browser.close();
}

main().catch(console.error);
