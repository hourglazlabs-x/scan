// expo-sqlite's web build imports a .wasm file, so Metro must treat wasm as an
// asset for the web export to bundle. (The web build stores data with sql.js
// instead; see src/data/webDb.tsx.)
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm');

module.exports = config;
