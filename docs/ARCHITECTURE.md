# Architecture

MINDMODX Scan (working name) is an offline-first iPhone app. You scan a grocery barcode and get a NUÏTRIX score with its reasons, and every scan joins your Index.

## The flow

```
Camera (expo-camera)
  │ barcode: UPC-A / EAN-13 / EAN-8 / UPC-E
  ▼
Lookup (src/data/lookup.ts)
  ├─ 1. Cache on the phone (expo-sqlite): fresh record → done, works with no signal
  ├─ 2. Open Food Facts API v2 (src/off/client.ts): only the barcode is sent
  │      └─ normalize (src/off/normalize.ts) → Product (src/domain/types.ts)
  └─ 3. Network error and an old cached record → use the old record
  ▼
Score (src/rubric/engine.ts + nuitrix-v0.1.json)
  pure function: same product + same rubric → same result
  ▼
Screens (app/): Result, Breakdown, Incomplete, Index
```

## Layers

| Folder | What it does | Depends on |
| --- | --- | --- |
| `src/domain` | Types shared by every layer: Product, ScoreResult | nothing |
| `src/rubric` | The scoring engine, the rubric file and its validator | domain |
| `src/off` | Open Food Facts client, normalizer, barcode rules | domain |
| `src/data` | SQLite storage, lookup orchestration, React hooks for screens | domain, rubric, off, expo-sqlite |
| `src/theme` | LABS ANALYTIX design tokens and type styles | nothing |
| `src/ui` | Reusable components: dial, badges, plates, icons, tab bar | theme |
| `app` | Screens and navigation (expo-router) | everything above, through `src/data/contracts.ts` |
| `scripts` | Offline pack builder (runs on a computer, not on phones) | domain, rubric, off |

`src/domain`, `src/rubric` and `src/off` have no React Native imports. They run under plain Node, so `npm test` needs no simulator. A future server can reuse them unchanged.

## Key decisions

All decisions are recorded in [DECISIONS.md](DECISIONS.md).

- **The phone owns the verdict.** Scoring runs on the device from the cached product, so a scanned product still shows its score with no signal.
- **Fixed rules, not AI.** The score comes only from the rubric. Every rule shows its points and its sources. The summary sentence is a template over those rules. AI may write richer summaries later, but it will never set the score.
- **No guessing.** If data a pillar needs is missing, the product is Incomplete and the app asks for a photo of the label.
- **No server in v1.** Open Food Facts allows 15 product lookups per minute per IP. Phones call it directly, so that limit applies per user. A server becomes necessary for the API keys of the extras (YouTube, Amazon, an AI model), for a shared cache, and for object mode.
- **Open Food Facts data is under the ODbL.** The app credits "Open Food Facts contributors". Any database derived from OFF, including offline packs with scores, must be offered under the ODbL. The rubric and the code are not part of that database and stay private.

## Storage (expo-sqlite)

| Table | Holds |
| --- | --- |
| `products` | Normalized product JSON keyed by barcode, with the fetch time. This is the offline cache. |
| `entries` | One row per scanned product: its Index number, first and last scan time, and scan count |
| `ingredient_photos` | Photos of ingredient lists waiting to be read, for the Incomplete flow |

The schema version lives in `PRAGMA user_version`. Migrations run when the app starts.

## Web version

The same code builds for the web (`npm run build:web`) and is served by GitHub Pages at https://hourglazlabs-x.github.io/scan/. Three parts differ on the web:

| Part | Phone | Web |
| --- | --- | --- |
| Storage | expo-sqlite | sql.js (SQLite compiled to WebAssembly), saved whole to IndexedDB after writes (`src/data/webDb.tsx`). expo-sqlite's web build needs cross-origin isolation headers, which GitHub Pages can't send. |
| Barcode reading | the phone's native scanner | expo-camera's web scanner: the browser's BarcodeDetector where there is one, otherwise a zxing WebAssembly decoder served from the site (`src/ui/scannerSetup.web.ts`) |
| Open Food Facts requests | with the app's User-Agent | without it, since browsers don't allow one; Open Food Facts allows cross-origin reads |

Both storage back ends build the same context (`src/data/context.ts`), so lookups, history and scoring are shared code.

## Offline pack

`scripts/build-pack.ts` turns Open Food Facts' bulk export into a SQLite pack of the most-scanned US products, with scores already calculated. It isn't wired into the app yet. The next step is to download a pack on first launch over Wi-Fi and merge it into `products`.

## Next phases

1. **Founder rubric v1.** Replace the draft weights and additive list, and check every source.
2. **Development build.** Needs an Apple Developer account. It adds on-device text reading for ingredient photos and TestFlight distribution.
3. **Server.** API keys, a shared cache, AI summaries, and YouTube, Amazon and Wikipedia extras.
4. **Object mode.** Identify a photographed object with an online image model, and show the same kind of entry as for food.
