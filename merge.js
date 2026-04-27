const fs = require('fs');
const path = require('path');
const config = require('./config');

const DIR = __dirname;
const DATA = path.join(DIR, 'data', config.version);
const OUTPUT = path.join(DATA, 'results_final.csv');

// ─── Blacklist emails faux positifs (annuaires, grossistes, templates, écoles…) ───
const EMAIL_BL = [
  // annuaires génériques
  'alicetoumit@yahoo.fr',
  'contact@infonet.fr',
  'contact@vicinorum.com',
  'contact@actulegales.fr',
  'contact@myaisai.com',       // attribué à tort à des dizaines de sociétés
  'pdp@sipa.ouest',
  'pdp@sipa.Ouest',
  'social@assoce.fr',
  'annonceslegales@litinerant.fr',
  '0844.044.609info@data.belegal',
  // grossistes/distributeurs
  'pantin@cedeo.fr',
  'pantin@pointp.fr',
  'ag.pantin@lariviere.fr',
  // hôtels/chaînes
  'bar@galliaparis.com',
  'reservation@galliaparis.com',
  'restaurant@lesrelaissolidaires.fr',
  // cabinets partagés / tiers
  'contact@cabinethoche.com',   // cabinet immo — attribué à ~5 sociétés
  'contact@esmod.com',
  'info@fep-iledefrance.fr',
  'info@montys.fr',
  'contact@groupe-ns.com',
  'sarlmarl93500@gmail.com',
  'admin@atelierp1.com',
  // école / associations
  'canique@anatole-france.fr',
  'carrosserie@anatole-france.fr',
  'jdoe@copernic.com',
  'janedoe@copernic.com',
  'webmaster@institut-benjamin-delessert.org',
  'secretariat@lycee-averroes.com',
  'delessert@crous-lyon.fr',
  'contact@ifsein.com',
  'a_laureau@innelec.com',
  'l_lapenu@innelec.com',
  'etapado@sauvegarde93.fr',
  'm.aouizerate@ggeedu.fr',
  'hopital-jeanjaures@groupe-sos.org',
  'contact@actulegales.fr',
  'inscription.ece.bdx@omneseducation.com',
  // doctolib et templates
  'contact.dataprivacy@doctolib.com',
  'legal.fr@doctolib.com',
  'julia@doctolib.fr',
  'contact.dataprivacy@doctolib.fr',
  // faux emails doctolib template
  'jean.dupont@email.fr',
  'martin.durand@email.com',
  'camille.dupont@email.fr',
  'nom@email.com',
  'nom@mail.com',
  'email@domain.com',
  // mail de test / invalides
  'xxx@xxx.mssante.fr',
  'xxx@xxx.apicrypt.org',
];

// TLDs valides (liste courte des courants) — rejeter `.Watch`, `.com.Watch`, etc.
const VALID_TLD = /\.(fr|com|net|org|eu|io|co|info|biz|pro|email|paris|shop|studio|art|media|tech|digital|agency|consulting|services|solutions|group|hotel|restaurant|cafe|bar|immo|city|app|online|store|site|web|pm|re|gp|mq|yt|nc|tf|wf|pf|mc|ad|be|ch|lu|es|it|de|nl|pt|pl|cz|ro|hu|bg|hr|sk|si|lt|lv|ee|dk|se|fi|no|at|gr|cy|mt|ie|is|li|je|gg|im|uk|ca|us|au|nz|za|ma|dz|tn|sn|ci|cm|cd|mg|re|ga)$/i;

function isBlacklisted(email) {
  const e = email.toLowerCase().trim();
  // email trop court / sans @
  if (e.length < 6 || !e.includes('@')) return true;
  // préfixe HTML encodé
  if (e.startsWith('u003e')) return true;
  // TLD invalide
  const domain = e.split('@')[1] || '';
  if (!VALID_TLD.test(domain)) return true;
  // domaine invalide ou générique
  if (/example|noreply|no-reply/.test(e)) return true;
  // doctolib / mssante / apicrypt
  if (/doctolib|mssante|apicrypt/.test(e)) return true;
  // abonnements / magazines
  if (/abonnement@|leparticulier\.fr/.test(e)) return true;
  // domaines exemples/templates
  if (/@exemple\.com$|@email\.com$|@domain\.com$|@mail\.com$/.test(e)) return true;
  // emails templates Doctolib
  if (/laboratoire@|centre_imagerie@|jean\.dupont@|martindupont@|martin\.dupont@|marie\.durand@|martin\.durand@/.test(e)) return true;
  return EMAIL_BL.some(b => e === b.toLowerCase());
}

function cleanPhone(raw) {
  if (!raw) return '';
  const matches = raw.match(/(?:\+33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/g);
  return matches ? matches.join(' / ') : '';
}

function cleanEmails(raw) {
  if (!raw) return '';
  // On splitte par / , ; ou espace
  return raw.split(/[\s,;/]+/)
    .map(e => e.trim())
    .filter(e => e.length > 0 && e.includes('@') && !isBlacklisted(e))
    .join(',');
}

function isValidWebsite(url) {
  if (!url) return false;
  const normalized = url.trim().toLowerCase();
  if (!normalized.startsWith('http')) return false;
  if (normalized.includes('google.com/maps') || normalized.includes('maps.google.com') || normalized.includes('google.com/search')) return false;
  if (normalized.includes('pagesjaunes.fr') || normalized.includes('facebook.com') || normalized.includes('instagram.com') || normalized.includes('tripadvisor.com') || normalized.includes('yelp.com')) return false;
  return true;
}

// ─── Parse CSV (séparateur ; avec guillemets) ───
function parseCSV(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter(l => l.trim());
  const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ';' && !inQ) { vals.push(cur); cur = ''; }
      else cur += c;
    }
    vals.push(cur);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  }).filter(r => Object.values(r).some(v => v));
}

// ─── Normalisation des catégories ───
const CAT_MAP = [
  // Coiffure / barbier
  [/coiffeur|coiffure|coiff|hair_care|barbier|barber|barb_shop/i,  'coiffeur / barbier'],
  // Beauté
  [/beauty_salon|beauty|beauté|esthétique|estheti|nail|ongleri|spa|institut|maquillage|tatoo|tattoo|tatouage|massage|bien.être/i, 'beauté / esthétique'],
  // Boulangerie
  [/boulang|pâtisserie|patisserie|viennoiserie|cuisson de produits/i, 'boulangerie / pâtisserie'],
  // Boucherie
  [/boucherie|boucher|viande|charcuterie/i,                'boucherie / charcuterie'],
  // Restauration
  [/restaurant|restaur|traiteur|snack|kebab|pizza|sushi|fast.food|services des traiteur|gastronomie/i, 'restaurant / traiteur'],
  // Bar / café
  [/bar|café|cafe|brasserie|bistrot|débits de boissons/i,  'bar / café / brasserie'],
  // Hôtel
  [/hôtel|hotel|hébergement|hebergement/i,                 'hôtel / hébergement'],
  // Plomberie
  [/plombier|plomberie|chauffage|sanitaire|installation d.eau/i, 'plomberie / chauffage'],
  // Électricité
  [/électricien|electricien|electricite|électricité|travaux d.install/i, 'électricité'],
  // Peinture
  [/peintre|peinture|travaux de revêtement|travaux de plâtrerie/i, 'peinture / rénovation'],
  // Menuiserie
  [/menuisier|menuiserie|travaux de menuiseri|fabrication de serru/i, 'menuiserie / serrurerie'],
  // Serrurerie
  [/serruri|serrurier/i,                                   'menuiserie / serrurerie'],
  // Maçonnerie / carrelage
  [/maçon|macon|maconnerie|maçonnerie|carrelage|carreleur|construction de mais|construction d.autre/i, 'maçonnerie / BTP'],
  // Fleuriste
  [/fleuriste/i,                                           'fleuriste'],
  // Pressing / nettoyage
  [/pressing|blanchisserie|nettoyage|laverie|désinfection/i, 'pressing / nettoyage'],
  // Photographe
  [/photographe|production de films/i,                     'photographe / audiovisuel'],
  // Auto-école
  [/auto.école|auto.ecole|conduite|enseignement de la c/i, 'auto-école'],
  // Épicerie / alimentation
  [/épicerie|epicerie|alimentation|supermarché|superette|commerce d.alimentat|commerce de détail a/i, 'épicerie / alimentation'],
  // Commerce de détail généraliste
  [/commerce de détail|commerce de gros|autres commerces|vente à distance|vente par automates/i, 'commerce de détail'],
  // Cordonnerie
  [/cordonnerie|cordonnier/i,                              'cordonnerie'],
  // Informatique
  [/informatique|réparation|conseil en systèmes/i,         'informatique / réparation'],
  // Immobilier
  [/immobilier|immo|marchands de biens|activités des agence|gestion de fonds/i, 'agence immobilière'],
  // SCI / foncier
  [/location de terrains|location.courte|location.autres|sci /i, 'immobilier / location'],
  // Déménagement
  [/déménagement|demenagement/i,                           'déménagement'],
  // Transport / taxi
  [/taxi|vtc|ambulance|transport/i,                        'taxi / transport'],
  // Bijouterie
  [/bijouterie|bijou|joaillerie|fabrication industri/i,    'bijouterie / artisanat'],
  // Pharmacie
  [/pharmacie|pharmac/i,                                   'pharmacie'],
  // Librairie
  [/librairie|livre/i,                                     'librairie'],
  // Autres services
  [/autres services|autres activités|activités spécialisé/i, 'services divers'],
  // Association / gestion
  [/activités des sièges|autres organisations|activités des syndic|accueil de jeunes/i, 'association / organisation'],
  // Fabrication / industrie
  [/fabrication de vêtem|fabrication de bière|activités de nettoya/i, 'industrie / fabrication'],
  // Événementiel
  [/organisation de foir|autres activités réc|activités des agence/i, 'événementiel / loisirs'],
  // Catchall Pappers résiduels
  [/travaux de revêtemen|travaux de plât/i,                'peinture / rénovation'],
  [/services des traiteu/i,                                'restaurant / traiteur'],
  [/activités photograph/i,                                'photographe / audiovisuel'],
  [/autre création artis|artisan/i,                        'artisanat divers'],
  [/commerce et réparati/i,                                'commerce de détail'],
  [/activités des sociét|autres intermédiaire|autres enseignements/i, 'services divers'],
  [/location|autres bi/i,                                  'immobilier / location'],
  [/00\.00/i,                                              'autre'],
];

function normalizeCategory(cat) {
  const c = cat.replace(/^(Planity-|Pappers-)/i, '').trim();
  for (const [re, label] of CAT_MAP) {
    if (re.test(c)) return label;
  }
  return c || 'autre';
}

// ─── Clé de déduplication ───
function dedupKey(nom, adresse) {
  const n = nom.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
  const a = adresse.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
  return n + '|' + a;
}

// ─── Fusion ───
const seen = new Map(); // key → row
const rows = [];

function addRow(nom, adresse, telephone, website, email, categorie, source, facebook = '') {
  const name = nom.trim();
  const addr = adresse.trim();
  if (!name) return;

  const key = dedupKey(name, addr);
  const cleanedEmail = cleanEmails(email);
  const cleanWebsite = isValidWebsite(website) ? website.trim() : '';
  const cleanFacebook = (facebook || '').trim().includes('facebook.com') ? (facebook || '').trim() : '';

  if (seen.has(key)) {
    const existing = seen.get(key);
    if (!existing.Email && cleanedEmail) existing.Email = cleanedEmail;
    if (!existing['Site Web'] && cleanWebsite) existing['Site Web'] = cleanWebsite;
    if (!existing.Facebook && cleanFacebook) existing.Facebook = cleanFacebook;
    if (!existing.Source.includes(source)) existing.Source += '+' + source;
    return;
  }

  const row = {
    Nom: name,
    Adresse: addr,
    Téléphone: cleanPhone(telephone),
    'Site Web': cleanWebsite,
    Email: cleanedEmail,
    Facebook: cleanFacebook,
    Catégorie: normalizeCategory(categorie),
    Source: source
  };
  seen.set(key, row);
  rows.push(row);
}

// ─── 1. Pages Jaunes ───
console.log('→ Lecture results.csv ...');
try {
  const pj = parseCSV(path.join(DATA, 'results.csv'));
  pj.forEach(r => addRow(
    r['Nom'],
    r['Adresse'],
    r['Téléphone(s)'] || '',
    r['Site Web'] || r['site web'] || r['website'] || '',
    r['Email'] || '',
    r['Catégorie'] || r['Activité'] || '',
    'PagesJaunes',
    r['Facebook'] || ''
  ));
  console.log(`   ${pj.length} lignes lues`);
} catch(e) { console.log('   ERREUR:', e.message); }

// ─── 2. Pappers ───
console.log('→ Lecture pappers_results.csv ...');
try {
  const pp = parseCSV(path.join(DATA, 'pappers_results.csv'));
  pp.forEach(r => addRow(
    r['Nom'],
    r['Adresse'],
    r['Téléphone(s)'] || '',
    r['Site Web'] || r['site web'] || r['website'] || '',
    r['Email'] || '',
    r['Catégorie'] || r['Activité'] || '',
    'Pappers'
  ));
  console.log(`   ${pp.length} lignes lues`);
} catch(e) { console.log('   ERREUR:', e.message); }

// ─── 3. Planity ───
console.log('→ Lecture planity_results.csv ...');
try {
  const pl = parseCSV(path.join(DATA, 'planity_results.csv'));
  pl.forEach(r => addRow(
    r['Nom'],
    r['Adresse'],
    r['Téléphone(s)'] || '',
    r['Site Web'] || r['site web'] || r['website'] || '',
    r['Email'] || '',
    r['Catégorie'] || r['Activité'] || '',
    'Planity'
  ));
  console.log(`   ${pl.length} lignes lues`);
} catch(e) { console.log('   ERREUR:', e.message); }

// ─── 4. Cylex ───
console.log('→ Lecture cylex_results.csv ...');
try {
  const cy = parseCSV(path.join(DATA, 'cylex_results.csv'));
  cy.forEach(r => addRow(
    r['Nom'],
    r['Adresse'],
    r['Téléphone'] || '',
    r['Site Web'] || r['website'] || '',
    r['Email'] || '',
    r['Catégorie'] || '',
    'Cylex'
  ));
  console.log(`   ${cy.length} lignes lues`);
} catch(e) { console.log('   ERREUR:', e.message); }

// ─── 5. Instagram ───
console.log('→ Lecture instagram_results.csv ...');
try {
  const ig = parseCSV(path.join(DATA, 'instagram_results.csv'));
  ig.forEach(r => {
    // Extraire adresse depuis la bio si possible
    const addr = (r['Bio'] || '').match(/\d+[^,\n]{0,40}(?:pantin|93500)/i)?.[0] || 'Pantin 93500';
    addRow(r['Nom Instagram'], addr, '', '', r['Email'] || '', r['Catégorie'] || '', 'Instagram');
  });
  console.log(`   ${ig.length} lignes lues`);
} catch(e) { console.log('   ERREUR:', e.message); }

// ─── Consolidation finale par Email ───
console.log('→ Consolidation finale par Email...');
const finalRows = [];
const emailMap = new Map(); // email -> row reference

rows.forEach(r => {
  if (!r.Email) {
    finalRows.push(r);
    return;
  }

  const emails = r.Email.split(',');
  let existingRow = null;

  // Chercher si un des emails de cette ligne existe déjà
  for (const email of emails) {
    if (emailMap.has(email)) {
      existingRow = emailMap.get(email);
      break;
    }
  }

  if (existingRow) {
    // Fusionner les sources
    if (!existingRow.Source.includes(r.Source)) {
      existingRow.Source += '+' + r.Source;
    }
    // Fusionner les téléphones (si différents)
    if (r.Téléphone && !existingRow.Téléphone.includes(r.Téléphone)) {
      existingRow.Téléphone += existingRow.Téléphone ? ' / ' + r.Téléphone : r.Téléphone;
    }
    // Fusionner le site web si manquant
    if (r['Site Web'] && !existingRow['Site Web']) {
      existingRow['Site Web'] = r['Site Web'];
    }
    // Fusionner les emails
    const allEmails = new Set([...existingRow.Email.split(','), ...emails]);
    existingRow.Email = [...allEmails].join(',');
    
    // On met à jour la map pour tous les emails de cette ligne
    allEmails.forEach(e => emailMap.set(e, existingRow));
  } else {
    finalRows.push(r);
    emails.forEach(e => emailMap.set(e, r));
  }
});

// ─── Écriture CSV final ───
const csvLines = ['Nom;Adresse;Téléphone;Site Web;Email;Avec Email;Catégorie;Source'];
finalRows.forEach(r => {
  const avecEmail = r.Email ? 'OUI' : '';
  const esc = v => '"' + (v || '').replace(/"/g, '""') + '"';
  csvLines.push([r.Nom, r.Adresse, r.Téléphone, r['Site Web'], r.Email, r.Facebook || '', avecEmail, r.Catégorie, r.Source].map(esc).join(';'));
});

fs.writeFileSync(OUTPUT, csvLines.join('\n'), 'utf8');

const avecEmailCount = finalRows.filter(r => r.Email).length;
const sources = {};
rows.forEach(r => { const s = r.Source.split('+')[0]; sources[s] = (sources[s]||0)+1; });

console.log(`\n✅ MERGE TERMINÉ`);
console.log(`   Total entreprises uniques : ${finalRows.length}`);
console.log(`   Avec email valide         : ${avecEmailCount}`);
console.log(`   Sans email                : ${finalRows.length - avecEmailCount}`);
console.log(`\n   Par source :`);
Object.entries(sources).forEach(([s,n]) => console.log(`     ${s.padEnd(15)} : ${n}`));
console.log(`\n   Fichier : ${OUTPUT}`);
