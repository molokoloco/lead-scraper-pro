# 📖 Walkthrough : Lead Scraper Pro V2

Ce document résume l'évolution du projet, les décisions techniques majeures et le fonctionnement actuel du système.

## 🏗️ 1. Architecture & Versioning
Le projet a été restructuré pour permettre une gestion par "campagnes".
- **Concept** : Chaque campagne a sa version (`v1`, `v2`, etc.).
- **Fichiers de Config** : Situés dans `/config`, ils pilotent tous les scrapers.
- **Data segmentation** : Les données sont stockées dans `/data/vX/`.

## 🌐 2. Gestion du Navigateur
Pour éviter les conflits avec la session Chrome personnelle de l'utilisateur :
- **Profil Dédié** : Le script utilise `./chrome_scraper_profile`.
- **Persistance** : Les logins Facebook et les "cookies de confiance" de Google/Bing sont conservés.
- **Mode Visible** : Le navigateur reste ouvert (`headless: false`) pour permettre la résolution manuelle des captchas.

## 🧠 3. Moteur d'Enrichissement (`enricher.js`)
C'est le module le plus complexe, conçu pour maximiser le taux de découverte des emails.

### Stratégie de recherche :
1. **Google Search** (Prioritaire) : Recherche `"Nom Entreprise" "Ville" email contact`.
2. **Web Scraping** : Visite des 3 premiers sites web trouvés pour extraire les emails.
3. **Facebook Fallback** : Si échec, recherche de la page Facebook et extraction de l'email depuis l'onglet "À propos".

### Sécurité & Discrétion :
- **Concurrency = 1** : Traitement séquentiel pour éviter les bans IP.
- **Délais Aléatoires** : Entre 15 et 40 secondes de pause entre chaque entreprise.
- **Pauses Manuelles** : 3 arrêts au démarrage pour laisser l'utilisateur préparer Facebook, Google et passer le premier captcha.

## 🧹 4. Consolidation des Données (`merge.js`)
- **Dédoublonnage** : Basé d'abord sur Nom+Adresse, puis sur l'Email final.
- **Fusion des Sources** : Si un lead est trouvé par plusieurs sources (ex: PagesJaunes et Google Maps), le script concatène les sources : `pagesjaunes, googlemaps`.
- **Dédoublonnage Emails** : Si deux lignes différentes aboutissent au même email, elles sont fusionnées.

## 🚀 5. Workflow Nominal
1. **Config** : Régler `config/index.js` sur la version voulue.
2. **Scan** : `npm run scan` (Collecte brute).
3. **Enrich** : `npm run enrich` (Recherche des contacts).
4. **Merge** : `node merge.js` (Fichier final propre).

---
*Ce système est conçu pour être à la fois puissant et respectueux des limites des moteurs de recherche grâce à l'intervention humaine ciblée.*
