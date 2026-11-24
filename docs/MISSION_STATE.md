# Mission state

**Updated:** 2026-11-22, after the install run
**Phase:** 1, prototype. The app compiles and builds for iOS, and the logic is tested against real products. It hasn't been opened on a phone yet.

## Done

### Run 1 (2026-11-21)

- **Scoring engine** (`src/rubric`), with draft rubric v0.1 and a strict validator. "Counted" points keep explanations honest when a pillar is clamped.
- **Open Food Facts layer** (`src/off`): client, normalizer, barcode rules (one canonical key) and a shared rate limiter.
- **Data layer** (`src/data`): SQLite storage, cache-first lookup with fallback to an older copy, and history. Only camera scans count as scans.
- **Screens** from the design canvas: Scan, Result, Incomplete, Breakdown, Index, You, and an Object mode placeholder. They're tagged "Draft" while the rubric is a draft, and credit Open Food Facts for data and photos.
- **Offline pack builder** (`scripts/build-pack.ts`).
- **Release check** (`npm run check:release`). It fails while placeholders or a draft rubric remain.
- **Independent review**: every confirmed finding was fixed. The remaining rubric questions are listed in [RUBRIC.md](RUBRIC.md#known-issues-with-the-draft-weights).

### Install run (2026-11-22)

- **Dependencies installed:** Expo SDK 58.0.26, React Native 0.88.1 and React 19.3.0 ([DECISIONS.md](DECISIONS.md), R24). The lockfile is committed.
- **The whole app compiles.** `npm run typecheck` and `npm run lint` are clean, and `npx expo export --platform ios` builds the iOS bundle.
- **Fixes the compiler and linter found:**
  - `StyleSheet.absoluteFill` replaces `absoluteFillObject`, which React Native 0.88 removed.
  - Navigation hooks come from expo-router, which carries its own navigation context.
  - The custom tab bar is typed against expo-router's tabs.
  - Fonts are imported one weight at a time, so the app carries only the seven font files it uses.
  - Three places that broke React's rules for hooks.
- **Real Open Food Facts data.** Seven real records are now test fixtures (`test/fixtures/off/real`). They confirmed the UPC-A and UPC-E keys, how `ingredients_n` is set, and that categories run from general to specific. They also found a unit error, now caught by a plausibility check (R25). Their scores are in [RUBRIC.md](RUBRIC.md#scores-of-real-products).
- **Tests:** all 142 pass.

### Screen check (2026-11-24)

- **Every screen renders.** The app's web build ran in a phone-sized browser. Real EAN-13 and UPC-A barcodes in a simulated camera feed were read by the app's own scanner and looked up against the real Open Food Facts fixtures. Checked: Scan, Result, Breakdown, Incomplete, Index, You and Object mode.
- **Two layout fixes:**
  - a perfect 100 cut to "1…" in the score dial
  - the Incomplete badge's stripes setting the badge's size

  Both came from how the web build sizes text and SVGs. The fixes make every build draw them the same.
- **Not committed:** the web build needs react-native-web and a few preview-only settings.

## Not verified yet

- **A run on a phone.** These compile against the real packages, but only a device run shows they work:
  - the camera: barcode reading, the torch, and the message when the camera fails to start
  - SQLite: migrations and queries on the phone
  - saving the ingredient photo
  - online and offline detection
  - the fonts, and each screen against the design canvas
- **Scores for the products testers will scan.** Seven real products have been scored. About 20 more well-known US products should be reviewed before testers see scores.

## Blocked (founder actions)

Nothing is blocked. Network access and the GitHub repo are done. The repo, [`hourglazlabs-x/scan`](https://github.com/hourglazlabs-x/scan), is public; switch it to private in GitHub settings if the code and rubric should stay private.

## Next steps, in order

1. **First device run (founder).** Install Expo Go, then follow the README steps. Scan 20 well-known US products and review their scores.
2. **Rubric v1 (founder).** Decide the weights, the additive list, the bonuses and the grade bands, and check every source. See [RUBRIC.md](RUBRIC.md#decisions-for-the-founder).
3. **Cut-short ingredient lists.** Find a signal in Open Food Facts records for an incomplete list, so such products show as Incomplete instead of scoring clean ([RUBRIC.md](RUBRIC.md#known-issues-with-the-draft-weights)).
4. **Offline pack in the app.** Download a pack over Wi-Fi on first launch and merge it into the cache.
5. **Development build.** Needs an Apple Developer account. Adds on-device text reading for ingredient photos, and TestFlight.
6. **Server.** Holds the API keys, a shared cache, AI summaries, and the YouTube, Amazon and Wikipedia extras.
7. **Object mode.**

## Open founder decisions

- The NUÏTRIX rubric v1, as above.
- The app's real name. "MINDMODX Scan" is a placeholder in `app.json` and `src/ui/appName.ts`.
- A contact email for the Open Food Facts User-Agent, in `src/off/config.ts`.
- An Apple Developer account.
