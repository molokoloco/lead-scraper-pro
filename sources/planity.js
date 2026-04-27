const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Clés Algolia Planity (publiques, read-only)
const ALGOLIA_APP_ID = 'DAY79MUBW3';
const ALGOLIA_API_KEY = '8ec84cdda274cec79b9ad155973bc864';
const PANTIN_LAT = config.location.coords.lat;
const PANTIN_LNG = config.location.coords.lng;
const OUTPUT_FILE = path.join(__dirname, '..', 'data', config.version, 'planity_results.csv');

// On garde ces catégories car elles sont spécifiques à Planity, mais on peut les mixer avec config.categories si besoin
const CATEGORIES = [
  'kinesitherapeute',
  'osteopathe',
  'coach',
  'reflexologue',
  'sophrologue',
  'massage',
  'bien_etre',
  'inclassable'
];

function post(url, body) {
  return new Promise((res, rej) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Algolia-Application-Id': ALGOLIA_APP_ID,
        'X-Algolia-API-Key': ALGOLIA_API_KEY,
        'Referer': 'https://www.planity.com/',
        'User-Agent': 'Mozilla/5.0',
      }
    };
    const req = https.request(options, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch { res({}); } });
    });
    req.on('error', rej);
    req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchCategory(category, page = 0) {
  const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/businesses/query?x-algolia-application-id=${ALGOLIA_APP_ID}&x-algolia-api-key=${ALGOLIA_API_KEY}`;
  const body = {
    params: [
      `filters=plCategories:${category}`,
      `aroundLatLng=${PANTIN_LAT},${PANTIN_LNG}`,
      'aroundRadius=3000',  // 3km autour de Pantin
      'hitsPerPage=100',
      `page=${page}`,
      'attributesToRetrieve=name,address,slug,phoneNumber,description,email,contact,website,plCategories,openingHours',
    ].join('&')
  };
  return post(url, body);
}

async function main() {
  const seen = new Set();
  const results = [];
  const csvLines = ['\uFEFFNom;Adresse;Téléphone;Email;Catégorie;URL Planity'];

  console.log(`Planity Algolia — Pantin (2km)\n${CATEGORIES.length} catégories\n`);

  for (const cat of CATEGORIES) {
    process.stdout.write(`→ ${cat} ... `);
    let catCount = 0;
    let page = 0;

    while (true) {
      const data = await searchCategory(cat, page);
      const hits = data.hits || [];
      if (hits.length === 0) break;

      for (const h of hits) {
        const slug = h.slug || h.objectID;
        if (seen.has(slug)) continue;
        seen.add(slug);

        const name = h.name || '';
        // address peut être un objet {street, city, zipCode} ou une chaîne
        const addr = h.address || {};
        const address = typeof addr === 'string' ? addr
          : [addr.street, addr.zipCode, addr.city].filter(Boolean).join(' ');
        const phone = h.phoneNumber || '';
        const email = h.email || h.contact?.email || '';
        const website = h.website || '';
        const planityUrl = `https://www.planity.com/${slug}`;

        results.push({ name, address, phone, email, cat, planityUrl, website });
        csvLines.push(`"${name}";"${address}";"${phone}";"${email}";"${cat}";"${planityUrl}"`);
        catCount++;
      }

      if (hits.length < 100) break;
      page++;
      await sleep(200);
    }

    console.log(`${catCount} salons`);
    await sleep(300);
  }

  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf8');

  const withPhone = results.filter(r => r.phone).length;
  const withEmail = results.filter(r => r.email).length;
  const withWebsite = results.filter(r => r.website).length;

  console.log(`\n✓ ${results.length} salons beauté/coiffure Pantin`);
  console.log(`  📞 Avec téléphone : ${withPhone}`);
  console.log(`  📧 Avec email     : ${withEmail}`);
  console.log(`  🌐 Avec website   : ${withWebsite} (à exclure pour notre ciblage)`);
  console.log(`  Fichier : ${OUTPUT_FILE}`);
}

main().catch(console.error);
