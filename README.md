# 🚀 Lead Scraper Pro v2

[![Node](https://img.shields.io/badge/node-%3E=18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/playwright-chromium-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![Status](https://img.shields.io/badge/status-production-brightgreen)]()
[![Version](https://img.shields.io/badge/version-1.0.0-blue)]()
[![License](https://img.shields.io/badge/license-private-red)]()
[![Made by](https://img.shields.io/badge/made%20by-JulienWeb.fr-5A4095)](https://julienweb.fr)

![Logo Lead Scraper Pro](https://github.com/molokoloco/lead-scraper-pro/blob/main/Logo-Lead-Scraper-Pro.png?raw=true "Logo Lead Scraper Pro")

> **Industrial-grade B2B prospecting pipeline** — multi-source scraping, dedup, enrichment.
> One command, one clean CSV, ready for Mailchimp / CRM / Lemlist.

| | |
|---|---|
| 🔎 **Sources** | PagesJaunes · Pappers · Google Maps · Planity · Cylex · Instagram |
| 🧹 **Merge** | Dedup by `Name+Address`, email-based consolidation, junk URL filtering |
| ✨ **Enrich** | Email + phone + website via Google → site scraping → Facebook fallback |
| 🛡️ **Robust** | Resume-safe (`.state.json`), manual captcha, isolated Chrome profile |
| 🎯 **Use case** | Local B2B outreach · craftsmen · freelancers · SMBs |

**Stack**: Node.js · Playwright · Isolated Chrome profile

---

### ⚡ TL;DR

```bash
npm install && npx playwright install chromium
npm run scan      # collect from all sources
npm run enrich    # merge + enrich
# → data/v2/results_final_enriched.csv ✅
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

- **`config/`** — version, cities, and category settings
- **`data/`** — campaign storage by version (`data/v1/`, `data/v2/`, …)
- **`sources/`** — scraper modules (Yellow Pages, Pappers, Google Maps, Instagram, Planity, Cylex)
- **`merge.js`** — merges raw source CSVs into a deduplicated base file
- **`enricher.js`** — enriches the merged file with emails, phones, and websites

---

### 🔄 Workflow

```
[Sources] ──► npm run scan ──► data/vX/*.csv (raw)
                                      │
                                      ▼
                                  merge.js ──► results_final.csv (dedup)
                                      │
                                      ▼
                              enricher.js ──► results_final_enriched.csv ✅
```

#### 1. Configure the active version

Create a new config file (e.g. `config/v4_example.js`) and set its `version` field to `v4`.
Then point `config/index.js` to it:

```js
const activeConfig = require('./v4_example');
module.exports = activeConfig;
```

`npm run scan` will create the matching export directory automatically (e.g. `data/v4/`).

#### 2. Collect raw leads

```bash
npm run scan
```

Each scraper writes raw CSV files into `data/[VERSION]/`.

#### 3. Merge + enrich

```bash
npm run enrich
```

This runs two steps in sequence:
1. `merge.js` — merges all raw source files into `data/[VERSION]/results_final.csv`
2. `enricher.js` — enriches the merged file only

**Why this is better**
- No more obsolete `*_enriched.csv` intermediate files
- Enrichment focused on a single canonical dataset
- `data/[VERSION]/` stays clean and predictable

**Merge sources** — `merge.js` reads:
`results.csv` · `pappers_results.csv` · `planity_results.csv` · `cylex_results.csv` · `instagram_results.csv`

**Final outputs**
- `data/[VERSION]/results_final.csv`
- `data/[VERSION]/results_final_enriched.csv`

---

### 🧹 How `merge.js` works

`merge.js` builds a single deduplicated base file from all raw sources.

- Reads each CSV source
- Normalizes key columns: `Name`, `Address`, `Phone`, `Website`, `Email`, `Category`, `Source`
- Cleans phone numbers via regex — strips button labels (`"Call"`, etc.), keeps only valid French formats (`0X XX XX XX XX`, `+33 X XX XX XX XX`)
- Filters invalid websites — rejects Google Maps, social media (Facebook, Instagram…), and directories (PagesJaunes, TripAdvisor, Yelp)
- Deduplicates primary rows by a normalized `Name+Address` key
- Fills missing fields when new data appears
- Merges duplicate sources without duplicating source labels
- Final consolidation pass: merges rows sharing the same email

---

### 🧠 How `enricher.js` works

`enricher.js` fills in missing email, phone, and website data for each company.

#### Execution modes
- **No argument** or `all` — runs `merge.js` first, then enriches `data/[VERSION]/results_final.csv`
- **Filename argument** — enriches that specific file

#### What gets enriched
Existing values are **never overwritten** — only missing fields are filled.

| Field | Sources tried (in order) |
|---|---|
| **Email** | Google results text → top visited links → Facebook about page |
| **Phone** | Google results text → top visited links → Facebook about page |
| **Website** | First valid non-directory link in Google → Facebook about page |

#### Enrichment process
- Launches Playwright with a dedicated Chrome profile
- Requires a manual Facebook login (one-time, profile saved)
- Verifies Google reachability before starting
- For each company:
  - Performs a Google search: `"name" "city" email contact`
  - Waits a randomized **15–40 s** delay to reduce rate-limiting
  - Visits up to 3 relevant links from results
  - Falls back to Facebook `/about` and `/about_contact_and_basic_info` if still incomplete

#### Data quality filters
- **Emails** — rejects blacklisted domains, system addresses (`noreply`, `support@`…), and placeholder patterns (`name@domain.com`, `email@example.com`…)
- **Phones** — regex-extracted, valid French formats only
- **Websites** — rejects Google Maps, social media, and directories (same rules as `merge.js`)

#### Technical details
- Writes output to `*_enriched.csv` during processing
- Saves progress to `filename.state.json` for resume capability
- Deletes the resume cache once the file is complete
- Cleans obsolete `*_enriched.csv` files after enriching the final dataset

---

### 📌 Best practices

- `npm run enrich` is the primary command
- `npm run merge` is optional — useful only if you want to regenerate `results_final.csv`
- Keep only `results_final_enriched.csv` as the final artifact
- Remove old intermediate `*_enriched.csv` files from `data/[VERSION]/`
- Keep `.state.json` files while runs are in progress (they're resume caches)

---

### 🚧 Troubleshooting

| Problem | Solution |
|---|---|
| Google captcha blocks | Visible mode is enabled — solve manually, the script resumes |
| Facebook asks for login | Log in once, profile is saved in `chrome_scraper_profile` |
| Process interrupted | Re-run `npm run enrich` — resumes from `.state.json` |
| Heavy rate-limiting | Increase the 15–40 s delay range in `enricher.js` |
| Empty results | Check `config/index.js` points to the correct version file |

---

### 🧪 Testing

Test the Google Maps scraper in isolation:

```bash
npm run test:google
```

---

### 💡 Notes

- Enricher runs in **visible mode** so captchas can be solved manually
- Use the dedicated Chrome profile (`chrome_scraper_profile`) to avoid conflicts with your regular browser
- If the process stops, just rerun `npm run enrich` — the state cache will resume progress

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
