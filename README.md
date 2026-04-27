# 🚀 Lead Scraper Pro v2.1

[![Node](https://img.shields.io/badge/node-%3E=18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/playwright-chromium-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![Status](https://img.shields.io/badge/status-production-brightgreen)]()
[![Version](https://img.shields.io/badge/version-2.1.0-blue)]()
[![License](https://img.shields.io/badge/license-private-red)]()
[![Made by](https://img.shields.io/badge/made%20by-JulienWeb.fr-5A4095)](https://julienweb.fr)

![Logo Lead Scraper Pro](https://github.com/molokoloco/lead-scraper-pro/blob/main/Logo-Lead-Scraper-Pro.png?raw=true "Logo Lead Scraper Pro")

> **Industrial-grade B2B prospecting pipeline** — multi-source scraping, dedup, enrichment.
> One command, one clean CSV, ready for Mailchimp / CRM / Lemlist.

| | |
|---|---|
| 🔎 **Sources** | PagesJaunes · Pappers · Google Maps · Planity · Cylex · Instagram |
| 🧹 **Merge** | Dedup by `Name+Address`, email-based consolidation, junk URL filtering |
| ✨ **Enrich** | Email + phone + website via Google → site scraping → Facebook (confirmed links only) |
| 🛡️ **Robust** | Resume-safe (`.state.json`), manual captcha, isolated Chrome profile |
| 🎯 **Use case** | Local B2B outreach · craftsmen · freelancers · SMBs |

**Stack**: Node.js · Playwright · Isolated Chrome profile

---

### ⚡ TL;DR

```bash
npm install && npx playwright install chromium
npm run scan      # collect from all sources
npm run enrich    # merge + enrich
# → data/vX/results_final_enriched.csv ✅
```

![npm-run-scan 1](https://github.com/molokoloco/lead-scraper-pro/blob/main/npm-run-scan.jpg?raw=true "Demo in progress")

![npm-run-scan 2](https://github.com/molokoloco/lead-scraper-pro/blob/main/npm-run-scan2.jpg?raw=true "Demo in progress")

---

### 🛠️ Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

---

### 📁 Project structure

```
config/          — version, city, and category settings
data/            — campaign storage by version (data/v1/, data/v2/, …)
sources/         — scraper modules (PagesJaunes, Pappers, Google Maps, Instagram, Planity, Cylex)
merge.js         — merges raw source CSVs into a deduplicated base file
enricher.js      — enriches the merged file with emails, phones, and websites
run_all.js       — runs all scrapers in sequence
tests/           — standalone test scripts for Google and Facebook flows
```

---

### 🔄 Pipeline A → Z

```
┌─────────────────────────────────────────────────────────┐
│  1. SCAN          npm run scan                          │
│                                                         │
│  planity.js   ──► planity_results.csv                   │
│  pappers.js   ──► pappers_results.csv                   │
│  pagesjaunes  ──► results.csv  (+ Facebook links)       │
│  googlemaps   ──► results.csv  (merged)                 │
│  instagram.js ──► instagram_results.csv                 │
│  cylex.js     ──► cylex_results.csv                     │
│                         │                               │
│  2. MERGE         merge.js                              │
│                         │                               │
│       dedup by Name+Address key                         │
│       consolidate by shared email                       │
│       normalize categories                              │
│                         ▼                               │
│               results_final.csv                         │
│                         │                               │
│  3. ENRICH        enricher.js                           │
│                         │                               │
│       For each company (one by one):                    │
│         ① Google search                                 │
│         ② Visit top organic links                       │
│         ③ Facebook (confirmed link only)                │
│                         ▼                               │
│          results_final_enriched.csv  ✅                 │
└─────────────────────────────────────────────────────────┘
```

---

### 1️⃣ `npm run scan` — Source scrapers

Each scraper runs headless (or stealth) and writes its own CSV into `data/[VERSION]/`.

| Script | Source | Method |
|---|---|---|
| `planity.js` | Planity.com | Playwright headless |
| `pappers.js` | Pappers.fr | Playwright headless |
| `pagesjaunes.js` | PagesJaunes.fr | Playwright headless — also captures Facebook profile link if present |
| `googlemaps.js` | Google Maps API | HTTP |
| `instagram.js` | Instagram | Google `site:instagram.com` → fallback Bing |
| `cylex.js` | Cylex.fr | Playwright headless |

---

### 2️⃣ `merge.js` — Dedup & normalize

Reads all source CSVs and builds a single clean `results_final.csv`.

- Normalizes columns: `Nom`, `Adresse`, `Téléphone`, `Site Web`, `Email`, `Facebook`, `Catégorie`, `Source`
- Cleans phones — strips labels, keeps valid French formats (`0X XX XX XX XX`, `+33 X…`)
- Filters invalid websites — rejects Google Maps, social media, directories
- **Primary dedup** by normalized `Name+Address` key — fills missing fields on collision
- **Secondary dedup** by shared email — merges rows that share the same address
- Normalizes categories via a keyword map (60+ patterns → clean labels)

---

### 3️⃣ `enricher.js` — Enrichment loop

Runs Chrome in visible mode with a persistent profile. Requires a one-time manual login to Facebook and Google at startup.

**For each company, in order:**

#### ① Google search
```
Query: "Company Name" "City" email contact
```
- Extracts emails and phones from the page text
- Collects organic links (H3-based, all Google domains filtered out)

#### ② Visit top organic links (up to 3)
- Parses emails and phones from each page
- Looks for a Facebook profile link on the page
  (ignores `/sharer`, `/share`, `/plugins` — only real profile links)

#### ③ Facebook — only if a trusted link is known
Facebook is visited **only when the profile URL is confirmed** from a reliable source:

| Source | Trust |
|---|---|
| Link scraped from PagesJaunes listing | ✅ High |
| Link found on the company's own website | ✅ High |
| Google search `"name" site:facebook.com` | ❌ Not used — too many false positives |

When a trusted Facebook link is found:
1. Extract profile base URL (handles `/username`, `/pages/Name/ID`, `profile.php?id=`, deep sub-pages like `/photos/…`)
2. Visit `profileBase/about`
3. If empty → try `profileBase/about_contact_and_basic_info` (personal profile)
4. If still empty → try `profileBase/directory_contact_info` (business page)

**Between each company:** randomized pause of **15–40 seconds** to avoid rate-limiting.

**Resume:** progress saved to `filename.state.json` — re-run `npm run enrich` to continue from where it stopped.

---

### 📊 Output columns

`results_final_enriched.csv`:

| Column | Description |
|---|---|
| `Nom` | Business name |
| `Adresse` | Full address |
| `Téléphone` | Phone number(s) |
| `Site Web` | Website URL |
| `Email` | Found email(s), comma-separated |
| `Facebook` | Facebook profile URL (from source or site) |
| `Catégorie` | Normalized business category |
| `Source` | Origin(s): PagesJaunes+Planity etc. |

---

### 🧹 Email quality filters

Emails are rejected if they match any of:
- Blacklisted domains (`google.com`, `facebook.com`, `sentry.io`, `wixpress.com`…)
- System prefixes (`noreply`, `no-reply`, `support@`…)
- Placeholder patterns (`nom@domaine.fr`, `email@example.com`, `jean.dupont@email.fr`…)
- Image file extensions (`.png`, `.jpg`…)
- Length > 80 characters

---

### ⚙️ Configuration

Create a config file in `config/` and point `config/index.js` to it:

```js
// config/v4_mytown.js
module.exports = {
  version: 'v4',
  location: {
    name: 'Pantin 93',
    keywords: ['pantin', '93500'],
    zip: '93500',
    coords: { lat: 48.8952, lng: 2.4008 },
    radius: 2000
  },
  categories: ['coiffeur', 'boulangerie', 'kinésithérapeute'],
  pappersQueries: ['coiffeur', 'boulangerie'],
  googleTypes: ['hair_care', 'bakery', 'physiotherapist']
};
```

```js
// config/index.js
module.exports = require('./v4_mytown');
```

---

### 🧪 Testing

```bash
# Test Google search + link extraction
node tests/test_google.js "Bryan Amram" "Pantin"

# Test Facebook profile discovery + contact extraction
node tests/test_facebook.js "FIT BARBER CUT" "Pantin"
```

Both test scripts accept optional `name` and `location` CLI arguments and mirror the exact logic used in `enricher.js`.

---

### 🚧 Troubleshooting

| Problem | Solution |
|---|---|
| Google captcha blocks | Visible mode — solve manually, script resumes automatically |
| Facebook asks for login | Log in once, profile saved in `chrome_scraper_profile/` |
| Process interrupted | Re-run `npm run enrich` — resumes from `.state.json` |
| Heavy rate-limiting | Increase the 15–40 s delay range in `enricher.js` |
| Empty results | Check `config/index.js` points to the correct version file |
| Instagram finds nothing | Google `site:instagram.com` ran first, Bing fallback tried — check if profiles exist |

---

### 📌 Best practices

- `npm run enrich` is the primary command — it merges then enriches
- `npm run merge` is optional — only if you need to regenerate `results_final.csv` without enriching
- Keep only `results_final_enriched.csv` as the final deliverable
- Keep `.state.json` files while a run is in progress (resume cache)
- One Chrome profile (`chrome_scraper_profile/`) is shared across all runs — keep it

---

### ⚠️ Legal & GDPR notice

- Respect each source's **Terms of Service** and `robots.txt`
- Collected data is **B2B only** (professional contacts), aligned with the GDPR "legitimate interest" legal basis
- Always include an **unsubscribe link** in any email campaign sent to this database
- Tool intended for **clean professional outreach** — not for spam or mass unsolicited messaging

---

### 👤 Author

**Julien Guézennec** — Freelance web developer & AI consultant since 1998
🌐 [JulienWeb.fr](https://julienweb.fr) · 📍 Pantin (93), France · **France Num** certified Activator

Independent web studio specialized in **WordPress development**, **local SEO/GEO**,
**e-commerce**, **Google/Facebook Ads** and **digital training** for craftsmen,
freelancers and SMBs across **Seine-Saint-Denis** and the Greater Paris area.

> 💡 This project showcases a hands-on approach to **business automation**:
> turning hours of manual prospecting into a reproducible pipeline.
> Need a custom tool (scraping, automation, AI integration)?
> 👉 [julienweb.fr/contact](https://julienweb.fr/contact)

📬 AI newsletter: **La Gueznet IA** — weekly insights on AI applied to web and local business.

---

<sub>Built with ☕ and Node.js in Pantin (93) · © 2026 Julien Guézennec — JulienWeb.fr</sub>
