const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    locale: 'fr-FR', timezoneId: 'Europe/Paris',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await ctx.newPage();

  const sources = [
    // Cylex - formats alternatifs
    'https://www.cylex-locale.fr/pantin/',
    'https://www.cylex-locale.fr/pantin/coiffure/',
    'https://www.cylex-locale.fr/search?q=coiffeur&location=pantin',
    // Villepratique - formats alternatifs
    'https://www.villepratique.fr/93500-pantin/',
    'https://www.villepratique.fr/coiffeurs-salons-de-coiffure/93500-pantin/',
    // 118712 - fiche individuelle connue
    'https://www.118712.fr/professionnels/X0VXX1RRFQc',
    // Manageo avec bypass cookie
    'https://www.manageo.fr/annuaire/93500/coiffure',
  ];

  for (const url of sources) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      await page.waitForTimeout(2000);

      const data = await page.evaluate(() => {
        const text = document.body.innerText;
        const emails = (text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [])
          .filter(e => !['google','bing','facebook','example','sentry','apple','microsoft','cylex','manageo'].some(d=>e.includes(d)));
        return {
          status: document.title.includes('404') || text.includes('introuvable') ? '404' : 'OK',
          emails,
          names: [...document.querySelectorAll('h2,h3,[class*="name"],[class*="title"],[class*="denomination"]')]
            .slice(0,4).map(el=>el.innerText.trim().substring(0,50)).filter(Boolean),
          snippet: text.substring(0,200).replace(/\n+/g,' ')
        };
      });

      const icon = data.status === '404' ? '✗' : '✓';
      console.log(`${icon} ${url.substring(0,65)}`);
      if (data.status === 'OK') {
        console.log('  Names:', data.names);
        console.log('  Emails:', data.emails.slice(0,3));
        console.log('  Text:', data.snippet.substring(0,120));
      } else {
        console.log('  → 404/introuvable');
      }
    } catch (e) {
      console.log(`✗ ${url.substring(0,65)} | ERR: ${e.message.substring(0,40)}`);
    }
    console.log();
  }

  await browser.close();
})().catch(console.error);
