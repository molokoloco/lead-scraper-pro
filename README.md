# 🚀 Lead Scraper Pro v2.1

[![Node](https://img.shields.io/badge/node-%3E=18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/playwright-chromium-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![Status](https://img.shields.io/badge/status-production-brightgreen)]()
[![Version](https://img.shields.io/badge/version-2.1.0-blue)]()
[![License](https://img.shields.io/badge/license-private-red)]()
[![Made by](https://img.shields.io/badge/made%20by-JulienWeb.fr-5A4095)](https://julienweb.fr)

[![Logo Lead Scraper Pro](https://github.com/molokoloco/lead-scraper-pro/blob/main/images/Logo-Lead-Scraper-Pro.png?raw=true "Logo Lead Scraper Pro")](https://github.com/molokoloco/lead-scraper-pro/blob/main/images/Logo-Lead-Scraper-Pro.png)

> **Industrial-grade B2B prospecting pipeline** — multi-source scraping, dedup, enrichment.
> One command, one clean CSV, ready for Mailchimp / CRM / Lemlist.

| | |
|---|---|
| 🔎 **Sources** | PagesJaunes · Pappers · Google Maps · Planity · Cylex · Instagram |
| 🧹 **Merge** | Dedup by `Name+Address`, email-based consolidation, junk URL filtering |
| ✨ **Enrich** | Email + phone + website via Google → site scraping → Facebook (confirmed links only) → `contact@domain` fallback |
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

[![npm-run-scan 1](https://github.com/molokoloco/lead-scraper-pro/blob/main/images/npm-run-scan.jpg?raw=true "Demo in progress")](https://github.com/molokoloco/lead-scraper-pro/blob/main/images/npm-run-scan.jpg)

Final result, from config to Google Sheet :

[![config-v4-results-final-enriched](https://github.com/molokoloco/lead-scraper-pro/blob/main/images/config-v4-results-final-enriched.png?raw=true "Demo in progress")](https://github.com/molokoloco/lead-scraper-pro/blob/main/images/config-v4-results-final-enriched.png)

---

### 🛠️ Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

#### 🔐 Chrome profile setup (required for enrichment)

The enricher (`npm run enrich`) runs a **visible Chrome window** with a persistent profile so you can solve captchas and stay logged in to Google and Facebook across runs.

**One-time setup:**

1. On first run, Chrome opens with the persistent profile defined in `config/index.js` → `chromeProfileDir`
2. **Log in to Google** — solve the first captcha if prompted, then sign in with your Google account
3. **Log in to Facebook** — the enricher will pause on the FB login page; log in manually, then the script resumes automatically
4. The profile is saved permanently — you only do this once

> ⚠️ **Keep the profile folder.** Deleting it means re-doing all logins.
> Never commit it — it contains your session cookies.

**Why the profile is stored outside the project:**

After heavy use, the Chrome profile grows to **~16 000 files** (cache, IndexedDB, session data). Storing it inside a Google Drive–synced folder causes Drive to re-sync thousands of tiny files after every scraping session, which is slow and pointless. The profile is therefore kept at a local path outside of Google Drive:

```
C:\Users\molok\Local Sites\chrome_scraper_profile
```

This path is configured in [`config/index.js`](config/index.js) via `chromeProfileDir`. To change it, edit that single line — all scripts pick it up automatically.

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
│                         │                               │
│  4. POST-PROCESS  (after full loop)                     │
│                         │                               │
│       For rows with website but no email:               │
│         ④ inject contact@domain.tld                     │
│                         ▼                               │
│          results_final_enriched.csv  ✅                 │
└─────────────────────────────────────────────────────────┘
```

---

### 1️⃣ `npm run scan` — Source scrapers

Each scraper runs headless (or stealth) and writes its own CSV into `data/[VERSION]/`.

| Script | Source | Method |
|---|---|---|
| `planity.js` | Planity.com | Algolia HTTP API — categories from `config.categoriesPlanity` |
| `pappers.js` | Pappers.fr | Playwright headless |
| `pagesjaunes.js` | PagesJaunes.fr | Playwright headless — also captures Facebook profile link if present |
| `googlemaps.js` | Google Maps API | HTTP |
| `instagram.js` | Instagram | Chrome persistent profile (stealth) — manual login → Google `site:instagram.com` → fallback Bing — profile URL validation → meta tag + DOM link extraction |
| `cylex.js` | Cylex.fr | Playwright headless — **Currently disabled** (bot detection) |

#### `instagram.js` — detail

Runs Chrome in **visible + stealth mode** (same persistent profile as the enricher) to avoid Instagram bot detection.

**Flow:**

1. **Manual login** — Chrome opens Instagram; script pauses until you press Enter after logging in
2. **Manual Google check** — pauses on Google for cookie acceptance / captcha
3. For each category in `config.categories`:
   - **Google search** `<category> <city> site:instagram.com` (20 results)
   - If 0 valid profiles → **Bing fallback** with Bing URL base64-decode
   - Profile URL validation: only `instagram.com/<username>/` accepted — `/p/`, `/reel/`, `/stories/`, `/explore/` etc. are rejected
   - Up to **8 profiles per search**
4. **Profile scrape** — reads `<meta name="description">` (contains bio + follower counts) and scans DOM links:
   - **Email** — extracted from the meta description text
   - **Website** — decoded from `l.instagram.com/l.php?u=` redirect links in the DOM (the "link in bio" field)
   - Bio and display name are **not kept** in the output
5. **Location filter** — keeps only profiles where the meta description or search title contains the target city/zip

**Output columns:** `Handle · Email · Site · Catégorie · URL`

> ⚠️ Requires a live Instagram session in the Chrome profile (`chromeProfileDir` in `config/index.js`). If the session expires, re-run and log in again when prompted.

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

#### ④ contact@ fallback (post-processing)

After the full loop completes, a final pass rewrites the enriched CSV:

- For every row that has a `Site Web` but an empty `Email`
- Extracts the root domain (`www.` stripped)
- Injects `contact@<domain>` — filtered against the same email blacklist
- Logged as: `✉️  12 email(s) contact@ ajouté(s) dans results_final_enriched.csv`

> This fills the "has a site, no scraped email" gap without extra HTTP requests.

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
  categories: ['coiffeur', 'boulangerie', 'kinésithérapeute'],   // PagesJaunes, Google Maps, Instagram
  pappersQueries: ['coiffeur', 'boulangerie'],                   // Pappers only
  googleTypes: ['hair_care', 'bakery', 'physiotherapist'],       // Google Maps API types
  categoriesPlanity: ['kinesitherapeute', 'osteopathe']          // Planity only (slugs sans accent)
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
| Facebook asks for login | Log in once, profile saved in `chromeProfileDir` (see `config/index.js`) |
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
- One Chrome profile (path in `config/index.js` → `chromeProfileDir`) is shared across all runs — keep it

---

### ⚠️ Legal & GDPR notice

- Respect each source's **Terms of Service** and `robots.txt`
- Collected data is **B2B only** (professional contacts), aligned with the GDPR "legitimate interest" legal basis
- Always include an **unsubscribe link** in any email campaign sent to this database
- Tool intended for **clean professional outreach** — not for spam or mass unsolicited messaging

---

### 🛡️ Disclaimer

> **This tool is provided for educational and professional automation purposes only.**

By using, copying, forking or adapting this code, you agree to the following:

1. **Personal responsibility** — You are solely responsible for how you use this tool and for any data you collect. The author cannot be held liable for any misuse, legal violations, or damages resulting from your use of this software.

2. **Compliance** — It is your responsibility to ensure your usage complies with applicable laws in your jurisdiction, including but not limited to: GDPR (EU Regulation 2016/679), the French *Loi Informatique et Libertés*, each scraped platform's Terms of Service, and the CAN-SPAM / ePrivacy Directive for email outreach.

3. **No warranty** — This software is provided **"as is"**, without warranty of any kind, express or implied. The author makes no guarantees regarding its accuracy, reliability, or fitness for any particular purpose.

4. **Reasonable use** — You are expected to use this tool **responsibly and ethically**: reasonable request rates, no harassment, no bulk unsolicited messaging, no resale of collected data without consent.

5. **No endorsement** — Publication of this code does not constitute an endorsement of scraping any particular website, nor an invitation to violate any platform's policies.

**TL;DR** — Don't spam, don't abuse, don't blame me. Use it wisely. 🙏

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
