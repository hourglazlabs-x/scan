# MINDMODX Scan

"MINDMODX Scan" is a placeholder name.

Scan a grocery barcode and get a **NUÏTRIX score** with the reasons behind it. Every product you scan joins your **Index**. The app works offline for anything it has already seen.

> **Status: prototype (run 1), not yet run on a phone.** The scoring engine, the Open Food Facts layer and storage are tested (see `npm test`). The screens are written but haven't been compiled against the Expo packages yet, because package installs were blocked in the build environment. The next step is `npx expo install` for the dependencies, then a first run on a device ([docs/MISSION_STATE.md](docs/MISSION_STATE.md)). The scoring rules are a draft for founder review ([docs/RUBRIC.md](docs/RUBRIC.md)). Product data comes from Open Food Facts.

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

- **Expo Go** on your iPhone (free on the App Store)
- **Node.js 22.18 or newer** on your Mac ([nodejs.org](https://nodejs.org), the LTS version). The tests run TypeScript directly, which needs 22.18 or newer.
- your Mac and iPhone on the same Wi-Fi

**Steps:**

```bash
git clone https://github.com/hourglazlabs-x/scan.git
cd scan
npm install
npx expo start
```

A QR code appears in the terminal. Point the iPhone's Camera app at it and tap the banner, and the app opens in Expo Go. Allow the camera when asked.

If the phone can't reach your Mac (for example on a guest network), run `npx expo start --tunnel` instead.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for the scoring engine, the Open Food Facts layer, storage logic and the pack builder. Uses plain Node and needs no phone. |
| `npm run typecheck` | Type-checks the whole app |
| `npm run typecheck:logic` | Strict type check of the code that runs without React Native |
| `npm run lint` | Lints the app |
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
