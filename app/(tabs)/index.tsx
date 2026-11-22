// Scan (mockup Main). The camera fills the screen behind a status chip and
// flash button, the targeting reticle, and after a match, a readout chip and
// a peek card with the score. A Barcode | Object switch sits above the tab bar.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCacheStats, useOnline } from '../../src/data/hooks';
import { color, radius, shadow, space } from '../../src/theme/tokens';
import { font, text } from '../../src/theme/type';
import { CameraPermissionPlate } from '../../src/ui/CameraPermission';
import { Chip } from '../../src/ui/Chip';
import { countLabel, formatBarcode, spokenDigits } from '../../src/ui/format';
import { IconButton } from '../../src/ui/Header';
import { Icon } from '../../src/ui/Icon';
import { PeekCard } from '../../src/ui/PeekCard';
import { Reticle } from '../../src/ui/Reticle';
import { StatusLight } from '../../src/ui/StatusLight';
import { useTabBarSpace } from '../../src/ui/TabBar';
import { Txt } from '../../src/ui/Txt';
import { useReduceMotion } from '../../src/ui/uiHooks';

/** A code seen again within this window is the same scan, not a new one. */
const REPEAT_WINDOW_MS = 3000;

/** Grocery symbologies only. A constant, so the camera is not reconfigured on every render. */
const SCANNER_SETTINGS: { barcodeTypes: Array<'ean13' | 'ean8' | 'upc_a' | 'upc_e'> } = {
  barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
};

interface ScanHit {
  /** Increases with every new scan; keys the peek card so each scan looks up afresh. */
  id: number;
  code: string;
  type: string;
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const isFocused = useIsFocused();
  const reduceMotion = useReduceMotion();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scan, setScan] = useState<ScanHit | null>(null);
  const lastSeen = useRef(new Map<string, number>());
  const currentCode = useRef<string | null>(null);
  const nextId = useRef(1);

  const granted = permission?.granted === true;
  // Only mount the camera while this tab is on screen, so it stops under the Result and other tabs.
  const cameraOn = granted && isFocused;

  useEffect(() => {
    if (!isFocused) {
      // The torch goes off with the camera; come back to a dark torch.
      setTorch(false);
      return;
    }
    // Coming back from the Result with the same pack still in view is not a new scan.
    const code = currentCode.current;
    if (code) lastSeen.current.set(code, Date.now());
  }, [isFocused]);

  const onBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    const code = result.data.trim();
    if (!code) return;
    const now = Date.now();
    const seen = lastSeen.current;
    const previous = seen.get(code);
    // Every sighting restarts the window, so a code held in view is one scan,
    // and it counts again only after 3 seconds out of view.
    seen.set(code, now);
    if (previous !== undefined && now - previous < REPEAT_WINDOW_MS) return;
    for (const [other, at] of seen) {
      if (now - at >= REPEAT_WINDOW_MS) seen.delete(other);
    }
    currentCode.current = code;
    setScan({ id: nextId.current++, code, type: result.type });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);

  return (
    <View style={styles.root}>
      {cameraOn ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={SCANNER_SETTINGS}
          onBarcodeScanned={onBarcodeScanned}
          enableTorch={torch}
        />
      ) : null}

      <View
        style={[styles.overlay, { paddingTop: insets.top + space.s1, paddingBottom: tabSpace + space.s3 }]}
        pointerEvents="box-none"
      >
        <View style={styles.topBar} pointerEvents="box-none">
          <StatusChip />
          {granted ? (
            <IconButton
              icon="flash"
              label="Flash"
              role="switch"
              variant="plate"
              active={torch}
              onPress={() => setTorch((on) => !on)}
            />
          ) : null}
        </View>

        {granted ? (
          <>
            <View style={styles.aim} pointerEvents="box-none">
              <View style={styles.aimAbove} />
              <Reticle animate={cameraOn && reduceMotion === false} />
              <View style={styles.readout}>{scan ? <Readout code={scan.code} type={scan.type} /> : <Hint />}</View>
              <View style={styles.aimBelow} />
            </View>
            {/* The slot keeps its height when empty, so the reticle never jumps. */}
            <View style={styles.peekSlot} pointerEvents="box-none">
              {scan ? <PeekCard key={scan.id} code={scan.code} type={scan.type} /> : null}
            </View>
          </>
        ) : (
          <View style={styles.permission}>
            {permission ? <CameraPermissionPlate permission={permission} onRequest={requestPermission} /> : null}
          </View>
        )}

        <ModeSwitch />
      </View>
    </View>
  );
}

/** "Offline ready" with the saved-product count, or the connection state when nothing is saved yet. */
function StatusChip() {
  const { cachedProducts } = useCacheStats();
  const online = useOnline();

  if (cachedProducts > 0) {
    const count = countLabel(cachedProducts, 'product', 'products', true);
    return (
      <Chip size="lg" elevated accessibilityLabel={`Offline ready, ${count} saved on this phone`}>
        <StatusLight tone="green" halo />
        <Txt style={styles.chipTitle} maxFontSizeMultiplier={1.4}>
          Offline ready
        </Txt>
        <Txt variant="label" tone="ink3" maxFontSizeMultiplier={1.4}>
          {count}
        </Txt>
      </Chip>
    );
  }
  // Keeps the flash button on the right while the connection is unknown.
  if (online === null) return <View />;
  const label = online ? 'Online' : 'Offline';
  return (
    <Chip size="lg" elevated accessibilityLabel={label}>
      <StatusLight tone={online ? 'aqua' : 'silver'} />
      <Txt style={styles.chipTitle} maxFontSizeMultiplier={1.4}>
        {label}
      </Txt>
    </Chip>
  );
}

function Readout({ code, type }: { code: string; type: string }) {
  return (
    <Chip size="md" elevated style={styles.centered} accessibilityLabel={`Matched, barcode ${spokenDigits(code)}`}>
      <Icon name="ring" size={18} color={color.signalGreen} strokeWidth={2.67} />
      <Txt style={styles.chipTitle} tone="greenInk" maxFontSizeMultiplier={1.4}>
        Matched
      </Txt>
      <Txt style={styles.code} tone="ink2" maxFontSizeMultiplier={1.4}>
        {formatBarcode(code, type)}
      </Txt>
    </Chip>
  );
}

function Hint() {
  return (
    <Chip size="md" elevated style={styles.centered}>
      <Txt style={styles.hint} tone="ink2" maxFontSizeMultiplier={1.4}>
        Hold a barcode inside the frame
      </Txt>
    </Chip>
  );
}

function ModeSwitch() {
  return (
    <View style={styles.modes}>
      <View
        style={[styles.mode, styles.modeOn]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Barcode mode"
        accessibilityState={{ selected: true }}
      >
        <Icon name="barcode" size={18} color={color.tileFg} />
        <Txt style={styles.modeLabel} tone="tileFg" maxFontSizeMultiplier={1.4}>
          Barcode
        </Txt>
      </View>
      <Pressable
        onPress={() => router.push('/object')}
        accessibilityRole="button"
        accessibilityLabel="Object mode"
        accessibilityHint="Opens object mode, which comes in the next phase"
        accessibilityState={{ selected: false }}
        style={({ pressed }) => [styles.mode, pressed && styles.modePressed]}
      >
        <Icon name="eye" size={18} color={color.ink2} />
        <Txt style={styles.modeLabel} tone="ink2" maxFontSizeMultiplier={1.4}>
          Object
        </Txt>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ground,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: space.s4,
    gap: space.s3,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
  },
  aim: {
    flex: 1,
    alignItems: 'center',
  },
  // The mockup sits the reticle low in the free space (about 3 : 1), near the camera's centre.
  aimAbove: {
    flex: 3,
  },
  aimBelow: {
    flex: 1,
  },
  readout: {
    minHeight: 32,
    marginTop: space.s3,
    alignItems: 'center',
  },
  centered: {
    alignSelf: 'center',
  },
  peekSlot: {
    minHeight: 96,
  },
  permission: {
    flex: 1,
    justifyContent: 'center',
  },
  chipTitle: {
    fontFamily: font.sansSemibold,
    fontSize: 13,
    lineHeight: 16,
  },
  code: {
    ...text.mono,
  },
  hint: {
    fontFamily: font.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  modes: {
    flexDirection: 'row',
    gap: space.s1,
    padding: 3,
    backgroundColor: color.plate,
    borderWidth: 1,
    borderColor: color.plateRim,
    borderRadius: radius.pill,
    ...shadow.card,
  },
  mode: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s2,
    borderRadius: radius.pill,
  },
  modeOn: {
    backgroundColor: color.ink,
  },
  modePressed: {
    backgroundColor: color.well,
  },
  modeLabel: {
    fontFamily: font.sansSemibold,
    fontSize: 14,
    lineHeight: 18,
  },
});
