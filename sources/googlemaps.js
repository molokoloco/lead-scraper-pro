const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// ← Coller ta clé API ici
const API_KEY = process.env.GOOGLE_API_KEY || 'VOTRE_CLE_ICI';

const OUTPUT_FILE = path.join(__dirname, '..', 'data', config.version, 'googlemaps_results.csv');

// Centre de la recherche
const LAT = config.location.coords.lat;
const LNG = config.location.coords.lng;
const RADIUS = config.location.radius || 2000;

// Types Google Places
const PLACE_TYPES = config.googleTypes;

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch { res({}); } });
    }).on('error', rej);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function nearbySearch(type, pageToken = null) {
  let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${LAT},${LNG}&radius=${RADIUS}&type=${type}&language=fr&key=${API_KEY}`;
  if (pageToken) url += `&pagetoken=${pageToken}`;
  return get(url);
}

async function getPlaceDetails(placeId) {
  const fields = 'name,formatted_address,formatted_phone_number,website,email,opening_hours,rating,user_ratings_total,types';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&language=fr&key=${API_KEY}`;
  return get(url);
}

async function main() {
  if (API_KEY === 'VOTRE_CLE_ICI') {
    console.error('❌ Merci de définir GOOGLE_API_KEY ou de remplacer VOTRE_CLE_ICI dans le script');
    process.exit(1);
  }

  const seenIds = new Set();
  const results = [];
  const csvLines = ['\uFEFFNom;Adresse;Téléphone;Site Web;Email;Sans site;Type;Place ID'];

  console.log(`Google Maps Places API — Pantin ${LAT},${LNG} rayon ${RADIUS}m\n`);

  for (const type of PLACE_TYPES) {
    process.stdout.write(`→ ${type} ... `);
    let pageToken = null;
    let typeCount = 0;
    let pages = 0;

    do {
      if (pageToken) await sleep(2000); // Google exige un délai entre pages
      const data = await nearbySearch(type, pageToken);

      if (data.status === 'REQUEST_DENIED') {
        console.error('\n❌ Clé API invalide ou Places API non activée:', data.error_message);
        process.exit(1);
      }
      if (data.status === 'ZERO_RESULTS') break;
      if (!data.results?.length) break;

      for (const place of data.results) {
        if (seenIds.has(place.place_id)) continue;
        seenIds.add(place.place_id);

        // Détails complets (website, phone)
        await sleep(100);
        const detail = await getPlaceDetails(place.place_id);
        const r = detail.result || {};

        const name = r.name || place.name || '';
        const address = r.formatted_address || place.vicinity || '';
        const phone = r.formatted_phone_number || '';
        const website = r.website || '';
        const noSite = !website ? 'OUI' : 'non';

        // Ne garder que Pantin
        if (!/pantin|93500/i.test(address + name)) continue;

        results.push({ name, address, phone, website, noSite, type });
        csvLines.push(`"${name}";"${address}";"${phone}";"${website}";"";"${noSite}";"${type}";"${place.place_id}"`);
        typeCount++;
      }

      pageToken = data.next_page_token || null;
      pages++;
    } while (pageToken && pages < 3);

    console.log(`${typeCount} à Pantin`);
    await sleep(500);
  }

  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf8');

  const noSite = results.filter(r => r.noSite === 'OUI');
  console.log(`\n✓ Terminé — ${results.length} lieux Pantin trouvés`);
  console.log(`  🚫 Sans site web : ${noSite.length}`);
  console.log(`  Fichier : ${OUTPUT_FILE}`);
}

main().catch(console.error);
