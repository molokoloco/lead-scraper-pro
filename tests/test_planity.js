const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const apiCalls = [];

  // Intercepter TOUTES les requêtes réseau
  page.on('request', request => {
    const url = request.url();
    const method = request.method();
    // Capturer les appels API/search/graphql
    if (
      url.toLowerCase().includes('api') ||
      url.toLowerCase().includes('search') ||
      url.toLowerCase().includes('graphql') ||
      url.toLowerCase().includes('algolia') ||
      url.toLowerCase().includes('firebase') ||
      url.toLowerCase().includes('firestore') ||
      url.toLowerCase().includes('.json') ||
      url.toLowerCase().includes('query')
    ) {
      apiCalls.push({
        method,
        url,
        postData: request.postData() ? request.postData().substring(0, 300) : null
      });
    }
  });

  // Aussi capturer les réponses pour voir les données
  const apiResponses = [];
  page.on('response', async response => {
    const url = response.url();
    if (
      url.toLowerCase().includes('api') ||
      url.toLowerCase().includes('search') ||
      url.toLowerCase().includes('graphql') ||
      url.toLowerCase().includes('algolia') ||
      url.toLowerCase().includes('firebase') ||
      url.toLowerCase().includes('firestore') ||
      url.toLowerCase().includes('.json') ||
      url.toLowerCase().includes('query')
    ) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const body = await response.text();
          apiResponses.push({
            url,
            status: response.status(),
            bodyPreview: body.substring(0, 500)
          });
        }
      } catch (e) {
        // ignorer les erreurs de lecture de réponse
      }
    }
  });

  console.log('=== TEST PLANITY API ===');
  console.log('Chargement de https://www.planity.com/coiffeur/93500-pantin ...');

  try {
    await page.goto('https://www.planity.com/coiffeur/93500-pantin', {
      waitUntil: 'networkidle',
      timeout: 45000
    });

    console.log('Page chargée. Attente de 3s supplémentaires pour les requêtes lazy...');
    await page.waitForTimeout(3000);

    // Scroller pour déclencher d'éventuelles requêtes lazy
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    console.log(`\n=== REQUÊTES API INTERCEPTÉES (${apiCalls.length} total) ===\n`);
    const uniqueApiCalls = [...new Map(apiCalls.map(c => [c.url, c])).values()];
    uniqueApiCalls.forEach((call, i) => {
      console.log(`[${i + 1}] ${call.method} ${call.url}`);
      if (call.postData) {
        console.log(`     POST DATA: ${call.postData}`);
      }
    });

    console.log(`\n=== RÉPONSES JSON (${apiResponses.length} total) ===\n`);
    const uniqueResponses = [...new Map(apiResponses.map(r => [r.url, r])).values()];
    uniqueResponses.forEach((resp, i) => {
      console.log(`[${i + 1}] ${resp.status} ${resp.url}`);
      console.log(`     BODY: ${resp.bodyPreview}`);
      console.log('');
    });

    // Extrait du contenu textuel pour vérifier que la page a bien chargé
    const textContent = await page.evaluate(() => document.body.innerText);
    console.log('\n=== EXTRAIT PAGE (400 premiers caractères) ===');
    console.log(textContent.substring(0, 400).replace(/\n+/g, ' | '));

  } catch (err) {
    console.error('Erreur:', err.message);
  }

  await browser.close();
  console.log('\n=== FIN PLANITY ===');
})();
