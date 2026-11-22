// Product identity at the top of the Result: an 88 pt thumbnail (the pack
// photo from Open Food Facts, or a category pictogram), then brand, name,
// quantity with category, and the photo credit when a photo shows.

import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import type { Product } from '../domain/types';
import { color, radius } from '../theme/tokens';
import { text } from '../theme/type';
import { categoryLabelFor } from './format';
import { Pictogram, pictogramFor } from './Pictogram';
import { Txt } from './Txt';

export function ProductHeader({ product }: { product: Product }) {
  const [imageFailed, setImageFailed] = useState(false);
  const category = categoryLabelFor(product.categories);
  const meta = [product.quantity, category].filter((part): part is string => Boolean(part)).join(' · ');
  const showImage = Boolean(product.imageUrl) && !imageFailed;

  return (
    <View style={styles.row}>
      <View style={styles.thumb}>
        {showImage ? (
          <Image
            source={{ uri: product.imageUrl }}
            style={styles.image}
            contentFit="contain"
            transition={150}
            onError={() => setImageFailed(true)}
            accessible={false}
          />
        ) : (
          <Pictogram
            kind={pictogramFor({ categories: product.categories, categoryLabel: category, name: product.name, basis: product.basis })}
            size={52}
            radius={radius.lg}
          />
        )}
      </View>
      <View style={styles.text}>
        {product.brand ? (
          <Txt variant="labelStrong" tone="ink3">
            {product.brand}
          </Txt>
        ) : null}
        <Txt variant="productName" accessibilityRole="header">
          {product.name ?? 'Unnamed product'}
        </Txt>
        {meta ? (
          <Txt style={styles.meta} tone="ink3">
            {meta}
          </Txt>
        ) : null}
        {/* Open Food Facts photos are CC BY-SA (the data is ODbL), so a shown photo is credited. */}
        {showImage ? (
          <Txt style={styles.credit} tone="ink3">
            Photo: Open Food Facts contributors (CC BY-SA)
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 2,
  },
  thumb: {
    width: 88,
    height: 88,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.plate,
    borderWidth: 1,
    borderColor: color.plateRim,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  image: {
    width: 76,
    height: 76,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  meta: {
    ...text.label,
    fontSize: 12.5,
    lineHeight: 17,
  },
  credit: {
    ...text.label,
    fontSize: 11,
    lineHeight: 14,
  },
});
