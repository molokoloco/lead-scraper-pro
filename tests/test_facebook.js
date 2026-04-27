const { chromium } = require('playwright'); 
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const wait = (msg) => new Promise(res => rl.question(`👉 ${msg}`, () => res()));

function decodeBingUrl(href) {
  const match = href.match(/[?&]u=a1([A-Za-z0-9+/=_-]+)/);
  if (!match) return href;
  try {
    let b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const decoded = Buffer.from(b64, 'base64').toString();
    // Si c'est un chemin relatif, on rajoute le domaine (cas rare)
    return decoded.startsWith('http') ? decoded : 'https://' + decoded.replace(/^\//, '');
  } catch { return href; }
}

async function testFB(name, location) {
  const userDataDir = path.join(__dirname, 'chrome_scraper_profile');
  
  console.log("🚀 Lancement du navigateur dédié au projet...");
  
  try {
    const browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: null
    });
    
    const page = await browser.newPage();
    
    console.log(`🔎 Recherche Bing pour: ${name} ${location}...`);
    const query = `${name} ${location} facebook about`;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    
    await page.goto(url);
    await wait('Vérifie les résultats Bing, résous le captcha si besoin, puis appuie sur ENTREE...');

    const allLinks = await page.evaluate(() => {
      return [...document.querySelectorAll('a')].map(a => a.href);
    });
    
    console.log(`Found ${allLinks.length} raw links.`);

    // On décode TOUS les liens pour chercher Facebook
    const decodedLinks = allLinks.map(decodeBingUrl);
    const fbLink = decodedLinks.find(url => url.includes('facebook.com') && !url.includes('posts'));

    if (fbLink) {
      const aboutUrl = fbLink.split('?')[0].replace(/\/$/, '') + '/about';
      console.log(`✅ Page trouvée: ${fbLink}`);
      console.log(`🚀 Navigation vers: ${aboutUrl}`);
      
      await page.goto(aboutUrl);
      await wait('Vérifie la page Facebook (About), puis appuie sur ENTREE pour extraire les emails...');
      
      const text = await page.evaluate(() => document.body.innerText);
      const emails = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
      
      const uniqueEmails = [...new Set(emails)].filter(e => !e.includes('facebook.com'));
      console.log(`\n📧 Emails trouvés:`, uniqueEmails);
    } else {
      console.log('❌ Aucune page Facebook trouvée dans les liens décodés.');
      console.log('DEBUG - 5 premiers liens décodés:', decodedLinks.slice(0, 10));
    }

    await browser.close();
  } catch (err) {
    console.error('Erreur:', err.message);
  }

  rl.close();
}

testFB("Facebook Mairie", "Pantin");
