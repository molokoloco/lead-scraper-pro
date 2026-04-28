// Modifie ce fichier pour changer de version active
const activeConfig = require('./v5_bobigny'); // v3_example v2_pro

module.exports = {
    ...activeConfig,
    chromeProfileDir: 'C:\\Users\\molok\\Local Sites\\chrome_scraper_profile',
};
