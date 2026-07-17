#!/usr/bin/env node
/**
 * verify_mx.js — vérification de délivrabilité par résolution MX (DNS), 0 dépendance.
 *
 * But : casser le taux de rebond AVANT envoi en retirant les emails dont le DOMAINE
 * n'accepte pas de mail (domaine mort / sans MX). C'est la cause n°1 des rebonds
 * observés sur les campagnes JulienWeb passées (voila.fr, ifrance.com, adresses
 * internes @bouyguestelecom.fr... = domaines qui ne routent plus).
 *
 * Ne fait PAS de handshake SMTP (RCPT TO) : peu fiable, souvent bloqué, et surtout
 * ça peut abîmer la réputation de l'IP. La vérif MX seule attrape déjà l'essentiel.
 *
 * Usage :
 *   node pipeline/verify_mx.js <input.csv> [--email-col "Email Address"] [--out-dir data/master/verified]
 *
 * Sorties (out-dir) :
 *   <base>.valid.csv     lignes dont le domaine a un MX (ou A/AAAA en fallback)
 *   <base>.invalid.csv   lignes rejetées (+ colonne _raison)
 *   <base>.mx-report.txt bilan par domaine
 */
'use strict';
const fs = require('fs');
const path = require('path');
const dnsmod = require('dns');
// Le résolveur c-ares par défaut peut pointer sur 127.0.0.1 (mort) selon l'environnement,
// alors que dns.resolveMx NE passe PAS par l'OS. On force des DNS publics fiables.
try { dnsmod.setServers(['8.8.8.8', '1.1.1.1', '9.9.9.9']); } catch (_) {}
const dns = dnsmod.promises;

const args = process.argv.slice(2);
const input = args.find(a => !a.startsWith('--'));
if (!input || !fs.existsSync(input)) { console.error('Fichier introuvable:', input); process.exit(1); }
const getFlag = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const emailColName = getFlag('email-col', null);
const outDir = getFlag('out-dir', path.join(path.dirname(input), 'verified'));

// --- parse CSV (gère guillemets + séparateur , ou ;) ---
function detectSep(headerLine) { return (headerLine.split(';').length > headerLine.split(',').length) ? ';' : ','; }
function splitCsvLine(line, sep) {
  const re = sep === ';' ? /("([^"]|"")*"|[^;]*)(;|$)/g : /("([^"]|"")*"|[^,]*)(,|$)/g;
  return (line.match(re) || []).map(c => c.replace(new RegExp(sep + '$'), '').replace(/^"|"$/g, '').replace(/""/g, '"'));
}
const raw = fs.readFileSync(input, 'utf8').replace(/^﻿/, '');
const lines = raw.split(/\r?\n/).filter(l => l.length);
const sep = detectSep(lines[0]);
const header = splitCsvLine(lines[0], sep);
let emailIdx = emailColName ? header.findIndex(h => h.trim().toLowerCase() === emailColName.toLowerCase())
                            : header.findIndex(h => /e-?mail/i.test(h));
if (emailIdx < 0) { console.error('Colonne email introuvable. En-têtes:', header.join(' | ')); process.exit(1); }

const rows = lines.slice(1).map(l => splitCsvLine(l, sep));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

// --- domaines uniques ---
const domains = new Map(); // domain -> {status, kind}
for (const r of rows) {
  const email = (r[emailIdx] || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) continue;
  const d = email.split('@')[1];
  if (!domains.has(d)) domains.set(d, null);
}

async function checkDomain(d) {
  try {
    const mx = await dns.resolveMx(d);
    if (mx && mx.length) return { ok: true, kind: 'MX', detail: mx.sort((a, b) => a.priority - b.priority)[0].exchange };
  } catch (_) { /* pas de MX, on tente A en fallback (certains petits domaines) */ }
  try {
    const a = await dns.resolve(d);
    if (a && a.length) return { ok: true, kind: 'A-fallback', detail: a[0] };
  } catch (_) {}
  return { ok: false, kind: 'NO-MX', detail: 'aucun enregistrement mail' };
}

// pool de concurrence
async function run() {
  const dlist = [...domains.keys()];
  const CONC = 20;
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < dlist.length) {
      const d = dlist[i++];
      domains.set(d, await checkDomain(d));
    }
  }));

  // split rows
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(input).replace(/\.csv$/i, '');
  const esc = v => sep === ',' ? `"${String(v ?? '').replace(/"/g, '""')}"` : String(v ?? '');
  const valid = [header.join(sep)], invalid = [header.concat('_raison').join(sep)];
  let nV = 0, nI = 0, nBad = 0;
  for (const r of rows) {
    const email = (r[emailIdx] || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { invalid.push(r.map(esc).concat(esc('syntaxe invalide')).join(sep)); nBad++; continue; }
    const res = domains.get(email.split('@')[1]);
    if (res && res.ok) { valid.push(r.map(esc).join(sep)); nV++; }
    else { invalid.push(r.map(esc).concat(esc(res ? res.kind : 'inconnu')).join(sep)); nI++; }
  }
  const bom = sep === ',' ? '' : '﻿';
  fs.writeFileSync(path.join(outDir, base + '.valid.csv'), bom + valid.join('\n'), 'utf8');
  fs.writeFileSync(path.join(outDir, base + '.invalid.csv'), bom + invalid.join('\n'), 'utf8');

  // rapport par domaine
  const rep = [`Vérif MX — ${base} — ${rows.length} lignes, ${domains.size} domaines uniques`, ''];
  const dead = [...domains.entries()].filter(([, v]) => v && !v.ok).map(([d]) => d);
  rep.push(`Domaines SANS mail (rejetés) : ${dead.length}`);
  dead.sort().forEach(d => rep.push(`  ✗ ${d}`));
  fs.writeFileSync(path.join(outDir, base + '.mx-report.txt'), rep.join('\n'), 'utf8');

  const total = nV + nI + nBad;
  const rate = total ? ((nI + nBad) / total * 100).toFixed(1) : '0';
  console.log(`${base} : ${nV} valides · ${nI} sans-MX · ${nBad} syntaxe → rebond potentiel évité ≈ ${rate}% (${nI + nBad}/${total})`);
}
run();
