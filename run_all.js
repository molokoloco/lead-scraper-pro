const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SOURCES_DIR = path.join(__dirname, 'sources');
const SCRIPTS = [
  'planity.js',
  'pappers.js',
  'pagesjaunes.js',
  'googlemaps.js',
  'instagram.js',
  'cylex.js'
];

async function runAll() {
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
  console.log('1. Enrichir les emails : npm run enrich <nom_du_fichier.csv>');
  console.log('2. Fusionner les résultats : node merge.js');
}

runAll();
