const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const urls = [
    'https://hoodspot.fr/pantin',
    'https://hoodspot.fr/search?q=coiffeur&city=pantin'
  ];

  for (const url of urls) {
    console.log('\n============================');
    console.log('URL:', url);
    console.log('============================');

    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      console.log('Status HTTP:', response ? response.status() : 'N/A');

      await page.waitForTimeout(2000);

      // Extraire tous les liens de la page
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors.map(a => ({
          href: a.href,
          text: a.textContent.trim().substring(0, 80)
        }));
      });

      // Filtrer les liens pertinents (fiches commerces)
      const relevantLinks = links.filter(l =>
        l.href.includes('hoodspot.fr') &&
        !l.href.includes('javascript:') &&
        l.href !== 'https://hoodspot.fr/' &&
        !l.href.includes('#')
      );

      console.log(`\nLiens trouvés (${relevantLinks.length} total) :`);
      const uniqueLinks = [...new Map(relevantLinks.map(l => [l.href, l])).values()];
      uniqueLinks.slice(0, 30).forEach(l => {
        console.log(`  [${l.text || '(sans texte)'}] → ${l.href}`);
      });

      // Chercher des emails sur la page
      const pageContent = await page.content();
      const emailMatches = pageContent.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
      const filteredEmails = emailMatches.filter(e =>
        !e.includes('sentry') && !e.includes('example') && !e.includes('.png') && !e.includes('.jpg')
      );
      const uniqueEmails = [...new Set(filteredEmails)];
      console.log(`\nEmails trouvés : ${uniqueEmails.length > 0 ? uniqueEmails.join(', ') : 'aucun'}`);

      // Afficher un extrait du contenu textuel
      const textContent = await page.evaluate(() => document.body.innerText);
      console.log('\nExtrait texte (500 premiers caractères) :');
      console.log(textContent.substring(0, 500).replace(/\n+/g, ' | '));

    } catch (err) {
      console.error('Erreur:', err.message);
    }
  }

  await browser.close();
  console.log('\n=== FIN HOODSPOT ===');
})();
