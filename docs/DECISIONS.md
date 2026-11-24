# Decisions

Newest at the bottom. "Founder" means the founder chose or approved it. "Lead" means the building agent chose it, and the founder can reverse it.

## Planning (2026-11-05)

| # | Decision | Why | By |
| --- | --- | --- | --- |
| P1 | **Offline-first.** The phone computes the verdict from a cached product. | Scanning has to work in a store with bad signal. | Founder |
| P2 | **Open Food Facts is the product data source.** Offline packs are built from its bulk export, not its API. | It's open, and large enough to cover most US products. Its API asks that bulk downloads use the export. | Founder |
| P3 | **Scores come from fixed, versioned rules.** AI never sets a score. | The same product should always get the same score, with reasons you can check. This matters after Yuka's nitrite lawsuits. | Founder |
| P4 | **Missing data means "Incomplete", never a guess.** | Open Food Facts records are often incomplete. A guessed score would be dishonest. | Founder |
| P5 | **No server in v1.** | Phones call Open Food Facts directly, and its rate limit is per IP, so it applies per user. A server is only needed for API keys and the extras. | Founder |
| P6 | **Stack:** Expo, React Native, TypeScript and SQLite. iPhone first, US products. | One language end to end. Expo Go runs the prototype with no Apple Developer account. | Founder |
| P7 | **Look:** the LABS ANALYTIX design system and the six-screen design canvas. | Keeps MINDMODX and LABS ANALYTIX one family. | Founder |

## Run 1 (2026-11-21)

| # | Decision | Why | By |
| --- | --- | --- | --- |
| R1 | **Repo:** `hourglazlabs-x/scan`, created 2026-11-22. It was planned as private and was created public. **Build network:** package registries plus Open Food Facts domains. | | Founder |
| R2 | **Logic tests use `node:test`, not Jest.** Component tests come later. | They run with zero dependencies, including in the build environment with installs blocked, and on a future server. | Lead |
| R3 | **Modules that run under plain Node import with explicit `.ts` extensions.** | Node's TypeScript type stripping requires it. Metro resolves them, and the app's tsconfig allows them. | Lead |
| R4 | **Rubric v0.1:** thresholds from the UK front-of-pack criteria and EU claim conditions. Weights are placeholders. The additive list is short. | Real thresholds, but the philosophy is the founder's to set. An additive that isn't on the list is "unrated", never "safe". | Lead (draft) |
| R5 | **Pillars are clamped to 0 to max,** and the breakdown says "capped" when that happens. | A pillar can't go negative or exceed its weight, and the math stays visible. | Lead |
| R6 | **A product is a drink when its categories include `en:beverages`.** | It's the simplest reliable signal in the Open Food Facts data. Known edge case: dry drink powders, coffee and tea get drink thresholds. | Lead |
| R7 | **UPC-A barcodes are stored and looked up as 13 digits** (a leading 0 added). | That's what the iPhone camera reports. One product gets one row in the cache, the history and the packs. | Lead |
| R8 | **Nutrient values are rounded to 0.001 g and 0.1 kcal.** Salt falls back to sodium × 2.5, and kcal falls back to kJ ÷ 4.184. | Float noise such as 0.30000000000000004 must not cross a threshold. | Lead |
| R9 | **Only a camera scan records history.** | Opening a product from the Index, or viewing its breakdown, isn't a scan. | Lead |
| R10 | **History is re-scored on read with the current rubric.** | Changing the rubric changes the score for every product, past scans included. | Lead |
| R11 | **The summary sentence is a template over the rules,** labelled "Summary", not "AI summary". | It can't disagree with the score. AI comes with the server. | Lead |
| R12 | **The Incomplete flow saves the ingredient photo, and v1 doesn't read it.** The screen copy says so. | Reading text on the phone needs a development build, and an Apple Developer account. | Lead |
| R13 | **"Better options" isn't built.** Object mode is a placeholder. | There's no data source for alternatives yet, and object mode needs a server. Fake content would mislead. | Lead |
| R14 | **Test fixtures are synthetic,** each marked with a `_note`, until the network is open. | No real Open Food Facts responses can be fetched from the build environment yet. | Lead |
| R15 | **Storage code is typed against a small `SqlDatabase` interface.** | The same SQL then runs on `node:sqlite` in tests, covering migrations, upserts and entry numbering. | Lead |
| R16 | **The Open Food Facts User-Agent uses a contact-email placeholder.** | The founder has to provide the address. | Lead |

## Run 1, after the independent review (2026-11-21)

| # | Decision | Why | By |
| --- | --- | --- | --- |
| R17 | **Every rule records `counted`:** the points it actually changed after its pillar was clamped. Explanations use only counted points. | The review found summaries that credited capped bonuses, and that named penalties which changed nothing. | Lead |
| R18 | **Amounts are compared at the precision they're shown, two decimals.** | So a label can never contradict its band. | Lead |
| R19 | **Additive ratings read "Rated high risk", and every score is tagged "Draft" while the rubric is a draft.** The validator refuses an approved rubric with any unchecked source. | Until the founder approves the rubric, a score must never read as a final health verdict. | Lead |
| R20 | **One shared request budget for Open Food Facts lookups,** about 12 a minute, plus a blocked-until time taken from Retry-After. The app shows the wait. | Open Food Facts allows 15 reads a minute per IP, and scanning a pantry shelf can exceed that. | Lead |
| R21 | **One canonical barcode key everywhere,** applied to the camera result before lookup. UPC-E expands to UPC-A; UPC-A becomes 13 digits. | So a product never gets two cache or Index rows. | Lead |
| R22 | **NetInfo is configured never to ping third parties.** | Its default reachability check calls Google, which contradicts "a lookup sends only the barcode". | Lead |
| R23 | **Product photos are credited as CC BY-SA, separately from the ODbL data.** | Open Food Facts licenses photos differently from the database. | Lead |

## Install run (2026-11-22)

| # | Decision | Why | By |
| --- | --- | --- | --- |
| R24 | **Expo SDK 58** (React Native 0.88, React 19.3), the current release. | Expo Go 58 is on the App Store, so the prototype still needs no Apple Developer account (P6). | Lead |
| R25 | **Implausible nutrient values are dropped, not scored:** salt above 2.5 g per 100 ml in a drink, and saturated fat above total fat. Saturated fat is 0 when total fat is 0. A dropped value counts as missing, so the product shows as Incomplete. | A real record for a 12 oz cola enters sodium in grams instead of milligrams, which would score as 31.7 g salt per 100 ml. | Lead |
| R26 | **Seven real Open Food Facts records join the synthetic fixtures** (updates R14). They're credited under the ODbL in their folder's README. The synthetic fixtures stay for edge cases real data rarely shows. | Real records found the unit error in R25 and confirmed the barcode keys (R7, R21). | Lead |

## Web version (2026-11-24)

| # | Decision | Why | By |
| --- | --- | --- | --- |
| R27 | **A web version on GitHub Pages,** at https://hourglazlabs-x.github.io/scan/. It's public and asks search engines not to list it. | The founder wants to scan any food with the iPhone camera without Terminal or an Apple Developer account. Expo's web build reuses every screen and the whole scoring engine. | Founder |
| R28 | **Web storage is sql.js, saved whole to IndexedDB after writes.** The same SQL and migrations run as on the phone. | expo-sqlite's web build needs SharedArrayBuffer, so cross-origin isolation headers, which GitHub Pages can't send. | Lead |
| R29 | **The web barcode decoder (zxing WebAssembly) is served from the site,** not from the jsDelivr CDN. | Keeps R22: scanning contacts no third party, and a lookup sends only the barcode, to Open Food Facts. | Lead |
| R30 | **Web requests to Open Food Facts carry no User-Agent header.** | Browsers drop it or turn the request into a CORS preflight. Open Food Facts allows cross-origin reads (Access-Control-Allow-Origin: *). | Lead |
