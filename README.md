# 🚀 Lead Scraper Pro v2
> **Version 1.0.0** — Système industriel de scraping et d'enrichissement de leads B2B avec multi-threading et fallback Facebook.

Ce projet permet de collecter, enrichir et fusionner des données de prospects B2B de manière automatisée et efficace.

## 🛠️ Installation

```bash
# Installer les dépendances
npm install

# Installer les navigateurs Playwright
npx playwright install chromium
```

## 📁 Structure du Projet

- **`config/`** : Centralisation des paramètres (Villes, Catégories, Versions). C'est le cerveau du projet.
- **`data/`** : Stockage segmenté par version (ex: `data/v1/`, `data/v2/`). Évite de mélanger les campagnes.
- **`sources/`** : Scrapers optimisés (Pages Jaunes, Pappers, Google Maps, Instagram, Planity, Cylex).
- **`enricher.js`** : Moteur d'enrichissement multi-browser (3 workers) avec décodeur Bing et fallback Facebook.
- **`merge.js`** : Fusion et dédoublonnage intelligent des résultats.

---

## 🚀 Workflow d'utilisation

### 1. Configuration
Modifiez le fichier `config/index.js` pour pointer vers la version active (ex: `require('./v2_pro')`). 
C'est **le seul fichier** à modifier pour changer de ville ou de cible.

### 2. Collecte des sources (Scan)
Lancez tous les scrapers en une seule commande :
```bash
npm run scan
```
Les fichiers CSV bruts seront générés dans `data/[VERSION]/`.

### 3. Enrichissement (Email Discovery)
Lancez l'enrichisseur intelligent :
```bash
npm run enrich
```
- **Vitesse** : 3 entreprises traitées simultanément (Parallel Workers).
- **Profil** : Utilise un profil Chrome dédié (`chrome_scraper_profile`) dans le projet.
- **Intelligence** : Décode les URLs Bing et cherche sur Facebook "À propos" si besoin.

### 4. Fusion finale (Merge)
Fusionnez tous les fichiers enrichis en un seul fichier propre et dédoublonné :
```bash
npm run merge
```
Le résultat final sera généré dans `data/[VERSION]/results_final.csv`.

---

## 🧪 Tests
Vous pouvez tester le scraper Google Maps séparément :
```bash
npm run test:google
```

---

## 💡 Astuces & Maintenance

- **Captchas** : L'enrichisseur est en mode visible. Si Bing affiche un captcha, résous-le directement dans la fenêtre Chrome.
- **Session Facebook** : La première fois que tu lances l'enrichisseur, connecte-toi à Facebook dans l'une des fenêtres pour activer les recherches futures.
- **Stabilité** : Le script utilise un profil Chrome isolé. Tu peux continuer à utiliser ton Chrome habituel avec tes 200 onglets sans aucun conflit.
- **Reprise** : En cas de coupure, relance `npm run enrich`, il reprendra automatiquement grâce au système de cache `.state.json`.

---
*Efficient & Powerful Lead Generation.*
