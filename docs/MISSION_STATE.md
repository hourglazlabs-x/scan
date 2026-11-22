# Mission state

**Updated:** 2026-11-21, end of build run 1
**Phase:** 1, prototype. The code is written and the logic is tested; it hasn't run on a phone yet.

## Done in run 1

- **Scoring engine** (`src/rubric`), with draft rubric v0.1 and a strict validator. "Counted" points keep explanations honest when a pillar is clamped.
- **Open Food Facts layer** (`src/off`): client, normalizer, barcode rules (one canonical key) and a shared rate limiter.
- **Data layer** (`src/data`): SQLite storage, cache-first lookup with fallback to an older copy, and history. Only camera scans count as scans.
- **Screens** from the design canvas: Scan, Result, Incomplete, Breakdown, Index, You, and an Object mode placeholder. They're tagged "Draft" while the rubric is a draft, and credit Open Food Facts for data and photos.
- **Offline pack builder** (`scripts/build-pack.ts`).
- **Release check** (`npm run check:release`). It fails while placeholders or a draft rubric remain.
- **Independent review**: every confirmed finding was fixed. The remaining rubric questions are listed in [RUBRIC.md](RUBRIC.md#known-issues-with-the-draft-weights).
- **Tests and type checks**: all `node --test` tests pass, and the strict type check of the logic code is clean.

## Not verified yet

- **The app has never been compiled against the real Expo packages, or run on a device.** Package installs were blocked in the build environment all day. Expect a round of compile fixes.
- **Library APIs assumed without being checked** (listed in the run-1 agent reports, condensed here):
  - **expo-camera:** `CameraView`, `onBarcodeScanned`, `barcodeScannerSettings`, `enableTorch`, `onMountError`, `takePictureAsync`, `useCameraPermissions`
  - **expo-sqlite:** `SQLiteProvider` with `onInit` and `onError`, `useSQLiteContext`, and the async query methods
  - **expo-file-system:** the SDK 54+ `File` and `Directory` API
  - **netinfo:** `configure` with `reachabilityShouldRun`, and `addEventListener`
  - **expo-router:** `Tabs` with a custom `tabBar`, nested `product/[code]` routes, `unstable_settings`
  - **Font packages:** `@expo-google-fonts/michroma`, `geist` and `geist-mono`, and their export names
- **Real Open Food Facts data.** All test fixtures are synthetic, because Open Food Facts couldn't be reached. Points to check against real responses:
  - when `additives_n` and `ingredients_n` are set
  - how UPC-A codes and 13-digit EAN codes resolve
  - the order of `categories_tags`

## Blocked (founder actions)

1. **Network access for this build environment.** Open the menu after the chat title, choose **Edit cloud environment**, then **Network access** → **Custom**. Keep the Trusted defaults and add `world.openfoodfacts.org` and `static.openfoodfacts.org`.
2. ~~The GitHub repo.~~ Done on 2026-11-22: [`hourglazlabs-x/scan`](https://github.com/hourglazlabs-x/scan), with run 1 pushed. It's public; switch it to private in GitHub settings if the code and rubric should stay private.

## Next steps, in order

1. **Install dependencies.** Run this inside the repo:

   ```bash
   npm install expo@latest
   npx expo install expo-router expo-camera expo-sqlite expo-file-system expo-haptics expo-image \
     expo-linking expo-splash-screen expo-status-bar expo-font expo-constants react-native-svg \
     react-native-safe-area-context react-native-screens @react-navigation/native \
     @react-navigation/bottom-tabs @react-native-community/netinfo \
     @expo-google-fonts/michroma @expo-google-fonts/geist @expo-google-fonts/geist-mono
   npx expo install -- --save-dev typescript @types/react @types/node eslint eslint-config-expo prettier
   npx expo install --check
   ```

   Then commit the lockfile.
2. **Get it compiling.** Run `npm run typecheck`, `npm run lint` and `npm test`, and fix every error.
3. **Use real fixtures.** Fetch about 10 real Open Food Facts records (ham, cola, oats, yogurt, trail mix, and a UPC-E product) to replace the synthetic fixtures, then re-check the normalizer's assumptions.
4. **First device run (founder).** Install Expo Go, then follow the README steps. Scan 20 well-known US products and review their scores.
5. **Rubric v1 (founder).** Decide the weights, the additive list, the bonuses and the grade bands, and check every source. See [RUBRIC.md](RUBRIC.md#decisions-for-the-founder).
6. **Offline pack in the app.** Download a pack over Wi-Fi on first launch and merge it into the cache.
7. **Development build.** Needs an Apple Developer account. Adds on-device text reading for ingredient photos, and TestFlight.
8. **Server.** Holds the API keys, a shared cache, AI summaries, and the YouTube, Amazon and Wikipedia extras.
9. **Object mode.**

## Open founder decisions

- The NUÏTRIX rubric v1, as above.
- The app's real name. "MINDMODX Scan" is a placeholder in `app.json` and `src/ui/appName.ts`.
- A contact email for the Open Food Facts User-Agent, in `src/off/config.ts`.
- An Apple Developer account.
