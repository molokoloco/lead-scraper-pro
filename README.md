# 🚀 Lead Scraper Pro v2
> **Version 1.0.0** — Industrial-grade B2B lead scraping and enrichment system with multi-threading and Facebook fallback.

[Français plus bas](#-version-française)

This project enables automated and efficient collection, enrichment, and merging of B2B prospect data.

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

## 📁 Project Structure

- **`config/`**: Configuration settings (Cities, Categories, Versions). The "brain" of the project.
- **`data/`**: Storage segmented by version (e.g., `data/v1/`, `data/v2/`). Prevents campaign mixing.
- **`sources/`**: Optimized scrapers (Yellow Pages, Pappers, Google Maps, Instagram, Planity, Cylex).
- **`enricher.js`**: Multi-browser enrichment engine (3 workers) with Bing decoder and Facebook fallback.
- **`merge.js`**: Intelligent merging and deduplication of results.

---

## 🚀 Usage Workflow

### 1. Configuration
Modify `config/index.js` to point to the active version (e.g., `require('./v2_pro')`). 
This is the **only file** you need to modify to change your target or city.

### 2. Source Collection (Scan)
Run all scrapers with a single command:
```bash
npm run scan
```
Raw CSV files will be generated in `data/[VERSION]/`.

### 3. Enrichment (Email Discovery)
Launch the intelligent enricher:
```bash
npm run enrich
```
- **Speed**: 3 companies processed simultaneously (Parallel Workers).
- **Profile**: Uses a dedicated Chrome profile (`chrome_scraper_profile`) within the project.
- **Intelligence**: Decodes Bing URLs and searches Facebook "About" pages if needed.

### 4. Final Merge
Merge all enriched files into a single, clean, deduplicated file:
```bash
npm run merge
```
The final result will be generated in `data/[VERSION]/results_final.csv`.

---

## 🧪 Testing
You can test the Google Maps scraper separately:
```bash
npm run test:google
```

---

## 💡 Tips & Maintenance

- **Captchas**: The enricher runs in visible mode. If Bing shows a captcha, solve it directly in the Chrome window.
- **Facebook Session**: The first time you run the enricher, log in to Facebook in one of the windows to enable future lookups.
- **Stability**: The script uses an isolated Chrome profile. You can keep using your regular Chrome with 200 tabs without any conflict.
- **Resume**: If interrupted, simply restart `npm run enrich`; it will automatically resume thanks to the `.state.json` cache system.

---

# 🇫🇷 Version Française

> Système industriel de scraping et d'enrichissement de leads B2B avec multi-threading et fallback Facebook.

Ce projet permet de collecter, enrichir et fusionner des données de prospects B2B de manière automatisée et efficace.

## 🛠️ Installation

```bash
npm install
npx playwright install chromium
```

## 📁 Structure du Projet

- **`config/`** : Centralisation des paramètres. C'est le cerveau du projet.
- **`data/`** : Stockage segmenté par version (ex: `data/v1/`).
- **`sources/`** : Scrapers optimisés (Pages Jaunes, Pappers, Google Maps, etc.).
- **`enricher.js`** : Moteur d'enrichissement multi-browser (3 workers).
- **`merge.js`** : Fusion et dédoublonnage intelligent.

## 🚀 Workflow d'utilisation

1.  **Configuration** : Modifiez `config/index.js` pour choisir la cible.
2.  **Scan** : `npm run scan` pour collecter les sources brutes.
3.  **Enrichissement** : `npm run enrich` pour trouver les emails/sites.
4.  **Fusion** : `npm run merge` pour le fichier final propre.

---
*Efficient & Powerful Lead Generation.*
