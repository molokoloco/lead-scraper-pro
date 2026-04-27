// Appel direct à l'API Algolia de Planity pour récupérer la liste complète des salons
const https = require('https');

const appId = 'DAY79MUBW3';
const apiKey = '8ec84cdda274cec79b9ad155973bc864';

// Reproduire le POST Algolia intercepté (index businesses, ville Pantin, catégorie hair_care)
const postData = JSON.stringify({
  params: "query=&page=0&filters=((plStatus > 0 AND plStatus != 2)) AND (parentPlaceId:mbq OR placeId:mbq) AND (plCategories:hair_care) AND (countryCode:FR OR countryCode:MC OR countryCode:RE OR countryCode:LU OR countryCode:AD OR countryCode:CH OR countryCode:GP OR countryCode:MQ OR countryCode:GF OR countryCode:PM OR countryCode:YT OR countryCode:BE)&hitsPerPage=50&getRankingInfo=true&aroundLatLng=48.8997868,2.3964111&aroundRadius=5000"
});

const options = {
  hostname: 'planity-prod.topsort.workers.dev',
  path: `/1/indexes/businesses/query?x-algolia-agent=Algolia%20for%20JavaScript%20(3.35.1)%3B%20Browser&x-algolia-application-id=${appId}&x-algolia-api-key=${apiKey}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const hits = json.hits || [];
      console.log(`=== RÉSULTATS ALGOLIA PLANITY (${hits.length} salons) ===\n`);
      hits.forEach((h, i) => {
        console.log(`[${i+1}] ${h.name}`);
        console.log(`     Adresse : ${h.address ? `${h.address.street}, ${h.address.postalCode} ${h.address.locality}` : 'N/A'}`);
        console.log(`     Slug : ${h.slug}`);
        console.log(`     URL planity : https://www.planity.com/${h.slug}`);
        console.log(`     ID Firebase : ${h.objectID || 'N/A'}`);
        if (h.phone) console.log(`     Tel : ${h.phone}`);
        if (h.email) console.log(`     Email : ${h.email}`);
        const keys = Object.keys(h).filter(k => !['pictures','_geoloc','location','_highlightResult','_rankingInfo','thumbs'].includes(k));
        console.log(`     Champs dispo : ${keys.join(', ')}`);
        console.log('');
      });
      console.log('nbHits total:', json.nbHits);
      console.log('page:', json.page, '/ nbPages:', json.nbPages);
    } catch(e) {
      console.error('Erreur parsing JSON:', e.message);
      console.log('Raw response (500 chars):', data.substring(0, 500));
    }
  });
});

req.on('error', e => console.error('Erreur requête:', e.message));
req.write(postData);
req.end();
