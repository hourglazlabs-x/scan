// Web build only. Browsers without a native BarcodeDetector (Safari, Firefox)
// read barcodes through expo-camera's barcode-detector polyfill, whose zxing
// decoder loads a wasm file from the jsDelivr CDN by default. It loads from
// this site instead (scripts/build-web.sh copies it), so scanning contacts no
// third party: a lookup still sends only the barcode, to Open Food Facts.
import { setZXingModuleOverrides } from 'barcode-detector';

const dir = `${process.env.EXPO_BASE_URL ?? ''}/zxing`;

setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? `${dir}/${path}` : prefix + path),
});
