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
    { name: 'Cylex', url: 'https://www.cylex-locale.fr/recherche/pantin/coiffeur.html' },
    { name: 'AlloVoisins', url: 'https://www.allovoisins.com/localite/pantin-93500' },
    { name: 'Villepratique', url: 'https://www.villepratique.fr/93500-pantin/coiffeurs-salons-de-coiffure/' },
    { name: 'Manageo', url: 'https://www.manageo.fr/societe/recherche?q=coiffure&cp=93500' },
    { name: '118712', url: 'https://www.118712.fr/results?who=coiffeur&where=pantin+93500&page=1' },
  ];

  for (const s of sources) {
    try {
      await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      await page.waitForTimeout(2500);

      // Refuser cookies si présent
      for (const sel of ['#axeptio_btn_dismiss', 'button:has-text("Refuser")', 'button:has-text("Tout refuser")', '[id*="reject"]', 'button:has-text("Continuer sans")', 'button:has-text("Accepter")', '#onetrust-reject-all-handler']) {
        try { await page.click(sel, { timeout: 1000 }); break; } catch {}
      }
      await page.waitForTimeout(1000);

      const data = await page.evaluate(() => {
        const text = document.body.innerText;
        const emails = (text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [])
          .filter(e => !['google', 'bing', 'facebook', 'example', 'sentry', 'apple', 'microsoft', 'w3.org'].some(d => e.includes(d)));
        const cards = document.querySelectorAll('[class*="result"], [class*="card"], [class*="item"], article, li.pro').length;
        const names = [...document.querySelectorAll('h2, h3, [class*="name"], [class*="denomination"]')]
          .slice(0, 5).map(el => el.innerText.trim()).filter(Boolean);
        return { url: location.href, cards, emails, names, snippet: text.substring(0, 300).replace(/\n+/g, ' ') };
      });

      console.log(`\n=== ${s.name} ===`);
      console.log('URL:', data.url.substring(0, 80));
      console.log('Cards:', data.cards, '| Emails:', data.emails.length, data.emails.slice(0, 3));
      console.log('Names:', data.names.slice(0, 4));
      console.log('Snippet:', data.snippet.substring(0, 150));
    } catch (e) {
      console.log(`\n=== ${s.name} === ERR:`, e.message.substring(0, 60));
    }
  }

  await browser.close();
})().catch(console.error);
