#!/usr/bin/env node
/**
 * build_master.js — fusionne les results_final_enriched.csv de data/v*
 * en un master dédupliqué + nettoyé + segmenté, prêt pour import Mailchimp.
 *
 * Usage : node pipeline/build_master.js
 * Sorties (data/master/) :
 *   - master.csv                 (tous les leads nettoyés, ; séparateur)
 *   - mailchimp_sante.csv        (import Mailchimp segment santé)
 *   - mailchimp_btp.csv          (import Mailchimp segment BTP/artisans)
 *   - mailchimp_tertiaire.csv    (import Mailchimp segment tertiaire)
 *   - sans_email_mobiles.csv     (leads sans email mais avec mobile 06/07 → WhatsApp manuel)
 *
 * Règles de nettoyage email :
 *   - regex valide + pas de placeholder (nom@domaine.fr)
 *   - domaines blacklistés (annuaires, presse, gouv)
 *   - email partagé par ≥3 leads distincts = erreur d'enrichissement → retiré
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const OUT = path.join(DATA, 'master');

const EMAIL_RE = /^[^\s@;"]+@[^\s@;"]+\.[a-z]{2,}$/i;
const EMAIL_BLACKLIST = /(?:@|\.)(gouv\.fr|elle\.fr|pagesjaunes\.fr|cylex|planity\.com|audentia-gestion\.fr|example\.|domaine\.fr|sentry\.io|wixpress\.com|keldoc\.com|doctolib\.|libheros\.fr|ousoigner\.fr|e-pro\.fr|action-sociale\.org|larousse\.fr|insee\.fr|ameli\.fr|ac-[a-z]+\.fr|justice\.fr|urssaf\.fr|sante\.fr|mappy\.com|monsite\.fr|kine\.onl|ens\.fr)$|nom@domaine|annuaire/i;
// fournisseurs génériques : un email @gmail etc. est plausible pour une TPE
const GENERIC_PROVIDER = /@(gmail|orange|wanadoo|free|hotmail|yahoo|outlook|sfr|laposte|live|neuf|bbox|icloud|aol|numericable)\./i;
// URLs qui ne sont PAS un vrai site du lead (annuaire, presse, gouv, réseaux)
const FAKE_SITE_RE = /pagesjaunes|cylex|planity|audentia-gestion|gouv\.fr|captain-kine\.fr\/annuaire|facebook\.com|instagram\.com|linkedin\.com|societe\.com|pappers/i;

const SEGMENTS = [
  { key: 'sante', label: 'Santé & bien-être', re: /kinésithérapeute|kine|ostéo|coach santé|coach sportif|pédicure|podologue|rééducation|thérap|bien-être|massage|yoga|pilates/i },
  { key: 'btp', label: 'BTP & artisans', re: /maçonnerie|btp|plomberie|chauffage|isolation|couvreur|toiture|rénovation|électricien|menuis|peinture|paysagiste|jardin|serrur|carrel|construction/i },
  { key: 'tertiaire', label: 'Tertiaire & services', re: /expert-comptable|comptab|startup|saas|architecte|architecture|avocat|conseil|agence|immobil|formation/i },
];

function parseCSV(file) {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const hdr = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const idx = (names) => hdr.findIndex(h => names.some(n => h.includes(n)));
  const iNom = idx(['nom']), iAdr = idx(['adresse']), iTel = idx(['téléphone', 'telephone']),
        iSite = idx(['site']), iMail = idx(['email']), iCat = idx(['catégorie', 'categorie']), iSrc = idx(['source']);
  return lines.slice(1).map(line => {
    // split ; en respectant les guillemets
    const cols = line.match(/("([^"]|"")*"|[^;]*)(;|$)/g)?.map(c =>
      c.replace(/;$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || [];
    const g = i => (i >= 0 && cols[i]) ? cols[i] : '';
    return { nom: g(iNom), adresse: g(iAdr), tel: g(iTel), site: g(iSite), email: g(iMail).toLowerCase(), cat: g(iCat), src: g(iSrc) };
  }).filter(r => r.nom && r.nom.toLowerCase() !== 'inconnu');
}

// --- collecte (ordre chronologique : les versions récentes écrasent les champs vides) ---
const versions = fs.readdirSync(DATA).filter(d => /^v\d+$/.test(d)).sort((a, b) => +a.slice(1) - +b.slice(1));
const byKey = new Map();
let totalRows = 0;
for (const v of versions) {
  const rows = parseCSV(path.join(DATA, v, 'results_final_enriched.csv'));
  totalRows += rows.length;
  for (const r of rows) {
    const key = r.nom.toLowerCase().replace(/\s+/g, ' ');
    const prev = byKey.get(key);
    if (!prev) { r.versions = [v]; byKey.set(key, r); }
    else {
      for (const f of ['adresse', 'tel', 'site', 'email', 'cat']) if (!prev[f] && r[f]) prev[f] = r[f];
      prev.versions.push(v);
    }
  }
}
let leads = [...byKey.values()];

// --- nettoyage emails ---
const emailCount = new Map();
for (const r of leads) if (r.email) emailCount.set(r.email, (emailCount.get(r.email) || 0) + 1);
let dropped = { invalid: 0, blacklist: 0, shared: 0 };
for (const r of leads) {
  if (!r.email) continue;
  if (!EMAIL_RE.test(r.email)) { r.email = ''; dropped.invalid++; }
  else if (EMAIL_BLACKLIST.test(r.email)) { r.email = ''; dropped.blacklist++; }
  else if (emailCount.get(r.email) >= 3) { r.email = ''; dropped.shared++; }
}

// --- enrichissement flags + confiance email ---
const normTel = t => (t || '').replace(/[\s.\-]/g, '');
const domainOf = u => { const m = String(u || '').match(/(?:@|\/\/(?:www\.)?)([a-z0-9.-]+\.[a-z]{2,})/i); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; };
const tokens = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{3,}/g) || [];
for (const r of leads) {
  r.mobile = /^0[67]/.test(normTel(r.tel)) ? r.tel : '';
  r.vraiSite = !!(r.site && r.site.length > 4 && !FAKE_SITE_RE.test(r.site));
  r.segment = (SEGMENTS.find(s => s.re.test(r.cat)) || { key: 'autre' }).key;
  r.ville = (r.adresse.match(/9\d{4}\s+([A-Za-zÀ-ÿ' -]+?)(?:\s{2,}|$)/) || [])[1]?.trim() || '';
  // confiance : domaine email = domaine site, OU fournisseur générique,
  // OU le domaine/localpart recoupe le nom de l'entreprise → sinon suspect (enrichissement annuaire)
  if (r.email) {
    const eDom = domainOf('@' + r.email.split('@')[1]);
    const sDom = r.vraiSite ? domainOf(r.site) : '';
    const nameToks = tokens(r.nom);
    const emailToks = tokens(r.email.split('@')[1].split('.')[0] + ' ' + r.email.split('@')[0]);
    const nameMatch = nameToks.some(t => emailToks.some(e => e.includes(t) || t.includes(e)));
    r.emailConfiance = (sDom && eDom === sDom) || GENERIC_PROVIDER.test(r.email) || nameMatch ? 'haute' : 'suspecte';
  } else r.emailConfiance = '';
}

// --- sorties ---
fs.mkdirSync(OUT, { recursive: true });
const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;

// master.csv
const masterHdr = ['Nom', 'Adresse', 'Ville', 'Téléphone', 'Mobile', 'Site Web', 'VraiSite', 'Email', 'EmailConfiance', 'Catégorie', 'Segment', 'Versions', 'Source'];
const masterLines = [masterHdr.join(';')].concat(leads.map(r =>
  [r.nom, r.adresse, r.ville, r.tel, r.mobile, r.site, r.vraiSite ? 'oui' : 'NON', r.email, r.emailConfiance, r.cat, r.segment, r.versions.join('+'), r.src].map(esc).join(';')));
fs.writeFileSync(path.join(OUT, 'master.csv'), '﻿' + masterLines.join('\n'), 'utf8');

// emails suspects (exclus de Mailchimp, à réviser à la main)
const suspects = leads.filter(r => r.emailConfiance === 'suspecte');
fs.writeFileSync(path.join(OUT, 'emails_suspects.csv'), '﻿' + ['Nom;Email;Site Web;Catégorie;Segment']
  .concat(suspects.map(r => [r.nom, r.email, r.site, r.cat, r.segment].map(esc).join(';'))).join('\n'), 'utf8');

// mailchimp par segment (CSV virgule, colonnes standard Mailchimp + merge fields) — confiance haute uniquement
const okMail = r => r.email && r.emailConfiance === 'haute';
const mcHdr = 'Email Address,Company,Phone,Address,Category,HasWebsite';
for (const seg of SEGMENTS) {
  const rows = leads.filter(r => okMail(r) && r.segment === seg.key);
  const csv = [mcHdr].concat(rows.map(r =>
    [r.email, r.nom, r.tel, r.adresse.replace(/,/g, ' '), r.cat, r.vraiSite ? 'yes' : 'no'].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')));
  fs.writeFileSync(path.join(OUT, `mailchimp_${seg.key}.csv`), csv.join('\n'), 'utf8');
  console.log(`mailchimp_${seg.key}.csv : ${rows.length} contacts (dont ${rows.filter(r => !r.vraiSite).length} sans vrai site)`);
}
const autres = leads.filter(r => okMail(r) && r.segment === 'autre');
if (autres.length) {
  const csv = [mcHdr].concat(autres.map(r =>
    [r.email, r.nom, r.tel, r.adresse.replace(/,/g, ' '), r.cat, r.vraiSite ? 'yes' : 'no'].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')));
  fs.writeFileSync(path.join(OUT, 'mailchimp_autre.csv'), csv.join('\n'), 'utf8');
  console.log(`mailchimp_autre.csv : ${autres.length} contacts (catégories hors segments)`);
}

// sans email mais mobile → WhatsApp/appel manuel
const wa = leads.filter(r => !r.email && r.mobile);
fs.writeFileSync(path.join(OUT, 'sans_email_mobiles.csv'), '﻿' + ['Nom;Mobile;Adresse;Catégorie;Segment;VraiSite']
  .concat(wa.map(r => [r.nom, r.mobile, r.adresse, r.cat, r.segment, r.vraiSite ? 'oui' : 'NON'].map(esc).join(';'))).join('\n'), 'utf8');

// stats
console.log(`\n=== MASTER : ${leads.length} leads uniques (depuis ${totalRows} lignes brutes, versions ${versions.join(',')}) ===`);
console.log(`Emails valides : ${leads.filter(r => r.email).length} (purgés — invalides:${dropped.invalid} blacklist:${dropped.blacklist} partagés≥3:${dropped.shared})`);
console.log(`  → confiance haute (import Mailchimp) : ${leads.filter(okMail).length} | suspects (emails_suspects.csv, à réviser) : ${suspects.length}`);
console.log(`Sans vrai site : ${leads.filter(r => !r.vraiSite).length} | Mobiles 06/07 : ${leads.filter(r => r.mobile).length} | Sans email avec mobile : ${wa.length}`);
const segStats = {}; leads.forEach(r => segStats[r.segment] = (segStats[r.segment] || 0) + 1);
console.log('Segments :', JSON.stringify(segStats));
