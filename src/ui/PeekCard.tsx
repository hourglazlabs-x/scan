// The card that rises under the reticle after a scan: thumbnail, brand and
// name, and the numeral score with its grade. It looks the product up with
// useProductLookup and opens the full Result when tapped.
//
// Render it with key={scan id}: a fresh mount runs a fresh lookup, which is
// how a repeat scan of the same code (after the 3-second window) retries.

import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { LookupState } from '../data/contracts';
import { useProductLookup } from '../data/hooks';
import { color, radius, shadow, space } from '../theme/tokens';
import { text } from '../theme/type';
import { LOOKUP_ERROR_COPY, categoryLabelFor, formatBarcode, spokenDigits } from './format';
import { GradeBadge } from './GradeBadge';
import { Icon } from './Icon';
import { Pictogram, pictogramFor } from './Pictogram';
import { Txt } from './Txt';

export interface PeekCardProps {
  code: string;
  /** Scanner symbology, used to format the code. */
  type?: string;
}

export function PeekCard({ code, type }: PeekCardProps) {
  // Only a camera scan counts as a scan; the Result and Breakdown just read.
  const state = useProductLookup(code, { record: true });
  const spoken = describe(state, code);

  // VoiceOver hears the outcome, not only the haptic.
  useEffect(() => {
    if (spoken.announce) AccessibilityInfo.announceForAccessibility(spoken.announce);
  }, [spoken.announce]);

  return (
    <Pressable
      onPress={() => router.push(`/product/${code}`)}
      accessibilityRole="button"
      accessibilityLabel={spoken.label}
      accessibilityHint="Opens the full result"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.thumb}>
        <Thumb state={state} />
      </View>
      <Body state={state} code={code} type={type} />
      <Icon name="chevronRight" size={18} color={color.ink3} />
    </Pressable>
  );
}

function Thumb({ state }: { state: LookupState | null }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (!state || state.status === 'loading') return <ActivityIndicator color={color.ink3} />;
  if (state.status === 'not_found') return <Icon name="question" size={26} color={color.ink3} strokeWidth={2} />;
  if (state.status === 'error') return <Icon name="warning" size={26} color={color.amberInk} strokeWidth={2} />;
  const { product } = state;
  if (product.imageUrl && !imageFailed) {
    return (
      <Image
        source={{ uri: product.imageUrl }}
        style={styles.image}
        contentFit="contain"
        transition={120}
        onError={() => setImageFailed(true)}
        accessible={false}
      />
    );
  }
  const kind = pictogramFor({
    categories: product.categories,
    categoryLabel: categoryLabelFor(product.categories),
    name: product.name,
    basis: product.basis,
  });
  return <Pictogram kind={kind} size={40} />;
}

function Body({ state, code, type }: { state: LookupState | null; code: string; type?: string }) {
  if (!state || state.status === 'loading') {
    return (
      <View style={styles.text}>
        <Txt variant="labelStrong" tone="ink3">
          Looking up
        </Txt>
        <Txt style={styles.code} tone="ink2" numberOfLines={1}>
          {formatBarcode(code, type)}
        </Txt>
      </View>
    );
  }
  if (state.status === 'not_found') {
    return (
      <View style={styles.text}>
        <Txt variant="value">Not in Open Food Facts yet</Txt>
        <Txt style={styles.code} tone="ink3" numberOfLines={1}>
          {formatBarcode(code, type)}
        </Txt>
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <View style={styles.text}>
        <Txt variant="rowTitle" numberOfLines={3}>
          {LOOKUP_ERROR_COPY[state.reason].peek}
        </Txt>
      </View>
    );
  }
  const { product, result } = state;
  return (
    <>
      <View style={styles.text}>
        {product.brand ? (
          <Txt variant="labelStrong" tone="ink3" numberOfLines={1}>
            {product.brand}
          </Txt>
        ) : null}
        <Txt variant="value" numberOfLines={2}>
          {product.name ?? 'Unnamed product'}
        </Txt>
      </View>
      <View style={styles.score}>
        <Txt variant="numeral" maxFontSizeMultiplier={1.3}>
          {result.score === null ? '—' : String(result.score)}
        </Txt>
        <GradeBadge grade={result.grade} label={result.gradeLabel} size="inline" />
      </View>
    </>
  );
}

/** The card's VoiceOver label, and what to announce once the lookup settles. */
function describe(state: LookupState | null, code: string): { label: string; announce?: string } {
  if (!state || state.status === 'loading') return { label: `Looking up barcode ${spokenDigits(code)}` };
  if (state.status === 'not_found') {
    const label = 'Not in Open Food Facts yet';
    return { label, announce: label };
  }
  if (state.status === 'error') {
    const label = LOOKUP_ERROR_COPY[state.reason].peek;
    return { label, announce: label };
  }
  const { product, result } = state;
  const name = product.name ?? 'Unnamed product';
  const score = result.score === null ? `not scored, ${result.gradeLabel}` : `${result.score} of 100, ${result.gradeLabel}`;
  const label = [product.brand, name, score].filter(Boolean).join(', ');
  return { label, announce: `${name}, ${score}` };
}

const styles = StyleSheet.create({
  card: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    padding: space.s3,
    backgroundColor: color.plate,
    borderWidth: 1,
    borderColor: color.plateRim,
    borderRadius: radius.lg,
    ...shadow.plate,
  },
  pressed: {
    backgroundColor: color.well,
  },
  thumb: {
    width: 70,
    height: 70,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.well,
    overflow: 'hidden',
  },
  image: {
    width: 62,
    height: 62,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  code: {
    ...text.mono,
    fontSize: 13,
    lineHeight: 18,
  },
  score: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 2,
  },
});
