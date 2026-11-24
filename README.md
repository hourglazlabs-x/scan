# MINDMODX Scan

"MINDMODX Scan" is a placeholder name.

Scan a grocery barcode and get a **NUÏTRIX score** with the reasons behind it. Every product you scan joins your **Index**. The app works offline for anything it has already seen.

> **Status: prototype.** The app compiles against Expo SDK 58 and builds for iOS and the web. The web version runs in a phone's browser at https://hourglazlabs-x.github.io/scan/ ([Web version](#web-version)). The tests cover the scoring engine, the Open Food Facts layer and storage, including seven real Open Food Facts products (see `npm test`). The scoring rules are a draft for founder review ([docs/RUBRIC.md](docs/RUBRIC.md)). Product data comes from Open Food Facts.

## What's built

- **Scan.** Live camera barcode reading for UPC-A, EAN-13, EAN-8 and UPC-E, with a haptic on a match and a result card under the reticle.
- **Result.** Score dial, grade (Optimal, Caution or Poor), a one-sentence summary, and the rules that moved the score most.
- **Score breakdown.** Every rule that was checked, with its points and sources. Each pillar shows its subtotal.
- **Incomplete.** When data is missing, the app shows what's missing instead of guessing, and you can photograph the ingredient list for later.
- **Index.** Every product you've scanned, numbered, with search and filters.
- **Offline.** Looked-up products are cached on the phone, and scoring always runs on the phone.

Object mode is next. It needs an online image model, so for now it's a placeholder screen.

## Run it on your iPhone

**You need:**

- **Expo Go** on your iPhone (free on the App Store). This project uses Expo SDK 58, which needs Expo Go 58 or newer.
- **Node.js 22.18 or newer** on your Mac ([nodejs.org](https://nodejs.org), the LTS version). Check with `node -v`. The tests run TypeScript directly, which needs 22.18 or newer.
- your Mac and iPhone on the same Wi-Fi

**Steps:**

```bash
git clone https://github.com/hourglazlabs-x/scan.git
cd scan
npm install
npx expo start
```

A QR code appears in the terminal. Point the iPhone's Camera app at it and tap the banner, and the app opens in Expo Go. Allow the camera when asked.

If Expo Go asks to find devices on your local network, tap **Allow**; without it the phone can't reach your Mac. If you tapped Don't Allow, turn it on in **Settings → Privacy & Security → Local Network → Expo Go**. If your Mac asks whether `node` may accept incoming connections, click **Allow**.

If the phone still can't reach your Mac (for example on a guest network), run `npx expo start --tunnel` instead.

## Web version

The same app runs in a phone's browser at **https://hourglazlabs-x.github.io/scan/**. Open it in Safari, allow the camera, and scan. To keep it on the home screen, tap **Share → Add to Home Screen**.

- It uses the phone's camera and looks products up live on Open Food Facts, like the phone app.
- Scans are saved in the browser on that phone, not on a server.
- The site is public. It asks search engines not to list it while the rubric is a draft.

`npm run build:web` builds it into `dist-web/`. `npm run deploy:web` builds it and replaces the `gh-pages` branch, which GitHub Pages serves (Settings → Pages → Deploy from a branch → `gh-pages`, `/ (root)`). How the web build differs from the phone app is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#web-version).

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for the scoring engine, the Open Food Facts layer, storage logic and the pack builder. Uses plain Node and needs no phone. |
| `npm run typecheck` | Type-checks the whole app |
| `npm run typecheck:logic` | Strict type check of the code that runs without React Native |
| `npm run lint` | Lints the app |
| `npm run build:web` | Builds the web version into `dist-web/` |
| `npm run deploy:web` | Builds the web version and publishes it to the `gh-pages` branch |
| `npm run build-pack -- --input <export.jsonl.gz> --out packs/us-top.sqlite` | Builds an offline pack from an Open Food Facts export. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). |

## Project layout

```
app/           screens and navigation (expo-router)
src/domain/    shared types
src/rubric/    the NUÏTRIX engine and rubric file (draft v0.1)
src/off/       Open Food Facts client and normalizer
src/data/      storage, lookups, and the hooks the screens use
src/theme/     LABS ANALYTIX design tokens
src/ui/        components
scripts/       offline pack builder
test/          unit tests (node:test)
docs/          architecture, rubric, decisions, mission state
```

## Data and license

Product data comes from [Open Food Facts](https://world.openfoodfacts.org) contributors, under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/). Product photos are under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

- The Result screen credits Open Food Facts for the data and the photo. The You screen states both licenses.
- Any database derived from Open Food Facts, including offline packs with scores, must be offered under the ODbL with the same credit.
- The scoring rules and this code are not part of that database.

Your scans stay on your phone. A lookup sends only the barcode to Open Food Facts.

## Before release

- **Set a real contact email** in `src/off/config.ts`. Open Food Facts asks apps to identify themselves in the User-Agent.
- **Approve the rubric** ([docs/RUBRIC.md](docs/RUBRIC.md)) and check every source.
- **Choose the app's real name.**
- **Get an Apple Developer account.** It's needed for TestFlight, and for a development build that can read ingredient photos.
