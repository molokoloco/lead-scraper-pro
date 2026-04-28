const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const arg = process.argv[2];

if (arg === 'scan') {
  const SOURCES_DIR = path.join(__dirname, 'sources');
  const SCRIPTS = [
    'planity.js',
    'pappers.js',
    'pagesjaunes.js',
    'googlemaps.js',
    'instagram.js',
    // 'cylex.js' // banni (bot detection)
  ];

  console.log('🚀 Démarrage du scan complet des sources...\n');
  const start = Date.now();

  for (const script of SCRIPTS) {
    const scriptPath = path.join(SOURCES_DIR, script);
    
    if (!fs.existsSync(scriptPath)) {
      console.warn(`⚠️  Script non trouvé : ${script}`);
      continue;
    }

    console.log(`\n--- [RUNNING] ${script} ---`);
    try {
      // On utilise stdio: 'inherit' pour voir la progression en temps réel
      execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
      console.log(`✅ ${script} terminé avec succès.`);
    } catch (err) {
      console.error(`❌ Erreur lors de l'exécution de ${script}`);
    }
  }

  const duration = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n✨ TOUTES LES SOURCES ONT ÉTÉ SCANNNÉES EN ${duration} MINUTES.`);
  console.log('📂 Les fichiers CSV sont disponibles dans le dossier sources/ et data/.');
  console.log('\n💡 Prochaines étapes recommandées :');
  console.log('1. Enrichir les emails et fusionner automatiquement : npm run enrich');
  console.log('2. Fusionner séparément si besoin : npm run merge');
} else if (arg === 'merge') {
  console.log('🚀 Démarrage du merge...\n');
  try {
    execSync(`node "${path.join(__dirname, 'pipeline', 'merge.js')}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ Erreur lors du merge`);
  }
} else if (arg === 'enrich') {
  console.log('🚀 Démarrage de l\'enrichissement...\n');
  try {
    const args = process.argv.slice(3).join(' ');
    execSync(`node "${path.join(__dirname, 'pipeline', 'enricher.js')}" ${args}`.trim(), { stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ Erreur lors de l'enrichissement`);
  }
} else {
  console.log('Usage: node index.js <scan|merge|enrich>');
}
