# 📖 Walkthrough : Lead Scraper Pro V2

Ce document décrit l'état actuel du projet, les choix techniques récents, et la démarche de la session de refonte.

## 🏗️ 1. Architecture & Versioning
Le projet est organisé en versions pour isoler les campagnes.
- **Config centralisée** : `/config/index.js` pointe vers la configuration active (`v2_pro` aujourd'hui).
- **Données segmentées** : les résultats sont stockés dans `data/v2/`.
- **Sources brutes** : chaque scraper écrit un CSV raw dans `data/v2/`.

## 🔄 2. Nouveau flux de traitement
La session a refondu le workflow pour réduire les fichiers intermédiaires et simplifier l'enrichissement.
- `npm run scan` collecte les leads bruts dans `data/v2/`.
- `npm run enrich` exécute maintenant d'abord `merge.js`, puis enrichit uniquement le fichier fusionné `results_final.csv`.
- Le seul fichier enrichi à conserver est `data/v2/results_final_enriched.csv`.
- Les anciens fichiers `*_enriched.csv` intermédiaires ne sont plus nécessaires.

## 🧠 3. `enricher.js` après refonte
Le moteur d'enrichissement reste le cœur du projet.
- Il utilise un profil Chrome dédié (`chrome_scraper_profile`).
- Il démarre en visible pour permettre le passage des captchas et la connexion Facebook.
- Il reprend automatiquement grâce aux fichiers `*.state.json` lorsque l'exécution est interrompue.
- Il enrichit aujourd'hui seulement `data/v2/results_final.csv` lorsque vous lancez `npm run enrich`.

## 🧹 4. `merge.js` après refonte
Le script de fusion a été simplifié pour traiter les fichiers sources bruts.
- Sources utilisées :
  - `results.csv`
  - `pappers_results.csv`
  - `planity_results.csv`
  - `cylex_results.csv`
  - `instagram_results.csv`
- Il dédoublonne d'abord sur `Nom+Adresse`.
- Il consolide ensuite par `Email` pour éviter les doublons finaux.
- Le fichier de sortie intermédiaire est `data/v2/results_final.csv`.

## 🚀 5. Workflow actuel
1. Modifier `config/index.js` pour activer la version souhaitée.
2. Lancer `npm run scan` pour collecter les données brutes.
3. Lancer `npm run enrich` pour fusionner, puis enrichir uniquement le fichier final.
4. Optionnel : `npm run merge` pour reconstruire simplement `data/v2/results_final.csv`.

## 🧩 6. Ce que nous avons changé pendant cette session
- Refonte du flux `enrich` pour qu'il commence par `merge`.
- Conversion de `merge.js` pour qu'il lise les fichiers sources bruts et non plus les fichiers `*_enriched.csv`.
- Nettoyage de `data/v2/` : suppression des anciens fichiers `*_enriched.csv` obsolètes.
- Maintien des fichiers `*.state.json` utiles pour la reprise d'enrichissement.

---
Ce document sert de guide rapide pour comprendre le workflow actuel et éviter de réintroduire des fichiers intermédiaires inutiles.