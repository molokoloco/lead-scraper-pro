const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('../config');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const TOKEN = process.env.PAPPERS_TOKEN;
if (!TOKEN) throw new Error('PAPPERS_TOKEN manquant — créez un fichier .env à la racine du projet (voir .env.example)');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', config.version, 'pappers_results.csv');
const QUERIES = config.pappersQueries;
const ZIP = config.location.zip;

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.pappers.fr/' }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch { res({}); } });
    }).on('error', rej);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchPappers(query, page = 1) {
  const url = `https://api.pappers.ai/v2/recherche?code_postal=${ZIP}&q=${encodeURIComponent(query)}&api_token=${TOKEN}&precision=standard&bases=entreprises&par_page=20&page=${page}&entreprise_cessee=false`;
  return get(url);
}

async function main() {
  const seen = new Set();
  const results = [];
  const csvLines = ['\uFEFFNom;Adresse;Code Postal;Ville;SIREN;NAF;Activité'];

  console.log(`Pappers API — ${config.location.name} ${ZIP}\n${QUERIES.length} requêtes\n`);

  for (const query of QUERIES) {
    process.stdout.write(`→ "${query}" ... `);
    let page = 1;
    let total = 0;
    let catCount = 0;

    do {
      try {
        const data = await searchPappers(query, page);
        if (!data.resultats || data.resultats.length === 0) break;
        total = data.total || 0;

        for (const r of data.resultats) {
          if (r.entreprise_cessee) continue;
          const siren = r.siren;
          if (seen.has(siren)) continue;
          seen.add(siren);

          const siege = r.siege || {};
          const nom = (r.nom_entreprise || r.denomination || `${r.prenom || ''} ${r.nom || ''}`).trim();
          const addr = siege.adresse_ligne_1 || '';
          const cp = siege.code_postal || '93500';
          const ville = (siege.ville || 'PANTIN').toUpperCase();

          // Ne garder que Pantin
          if (cp !== '93500' && !ville.includes('PANTIN')) continue;

          const naf = r.code_naf || '';
          const libelle = r.libelle_code_naf || '';

          results.push({ nom, addr, cp, ville, siren, naf, libelle });
          csvLines.push(`"${nom}";"${addr}";"${cp}";"${ville}";"${siren}";"${naf}";"${libelle}"`);
          catCount++;
        }

        if (page * 20 >= Math.min(total, 100)) break; // max 5 pages par requête
        page++;
        await sleep(300);
      } catch (err) {
        console.log(`Err: ${err.message.substring(0, 40)}`);
        break;
      }
    } while (true);

    console.log(`${catCount} nouvelles entreprises (total unique: ${seen.size})`);
    await sleep(400 + Math.random() * 300);
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf8');
  console.log(`\n✓ Terminé — ${results.length} entreprises Pantin uniques`);
  console.log(`  Fichier : ${OUTPUT_FILE}`);
}

main().catch(console.error);
