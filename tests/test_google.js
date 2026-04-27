const { chromium } = require('playwright'); 
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const waitManual = (msg) => new Promise(res => rl.question(`👉 ${msg}`, () => res()));

async function testGoogle(name, location) {
  const userDataDir = path.join(__dirname, 'chrome_scraper_profile');
  
  console.log("🚀 Lancement du navigateur (Profil Scraper)...");
  
  try {
    const browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: null,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    });
    
    const page = await browser.newPage();
    
    console.log(`🔎 Recherche Google pour: ${name} ${location}...`);
    // On simule une recherche d'enrichissement classique
    const query = `"${name}" "${location}" email contact`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=fr`;
    
    await page.goto(url);
    await waitManual("Vérifie les résultats Google (Captcha ?), puis appuie sur ENTREE...");

    const results = await page.evaluate(() => {
      // On prend TOUS les liens pour ne rien rater
      const links = [...document.querySelectorAll('a')];
      return links.map(a => ({
        text: a.innerText.trim(), 
        href: a.href
      })).filter(l => l.href.startsWith('http') && !l.href.includes('google.com') && l.href.length > 20);
    });
    
    console.log(`\n✅ Trouvé ${results.length} liens potentiels :`);
    results.forEach((l, i) => {
        if (i < 10) console.log(`  [${i+1}] ${l.text.substring(0, 40)}... -> ${l.href}`);
    });

    const fbLink = results.find(l => l.href.includes('facebook.com'));
    if (fbLink) {
        console.log(`\n👍 Facebook détecté : ${fbLink.href}`);
    } else {
        console.log("\nℹ️ Pas de lien Facebook dans les 10 premiers résultats.");
    }

    console.log("\nLa fenêtre reste ouverte. Appuie sur ENTREE dans le terminal pour fermer.");
    await waitManual("");
    await browser.close();
  } catch (err) {
    console.error('Erreur:', err.message);
  }
  rl.close();
}

// On teste un exemple concret de ton fichier
testGoogle("FIT BARBER CUT", "Pantin 93");
