// "What we have": the inputs behind a score, for a product that could not
// be scored. Amber "Missing" marks what blocks the score; grey marks what is
// unknown or optional; green "Found" marks what is there.

import { StyleSheet } from 'react-native';

import type { Product, ScoreResult } from '../domain/types';
import { color, type ColorName } from '../theme/tokens';
import { countLabel } from './format';
import type { IconName } from './Icon';
import { ListRow, Plate, PlateHeader } from './Plate';
import { IconTile } from './Tile';
import { Txt } from './Txt';

type Status = 'found' | 'missing' | 'unknown' | 'none';

interface HaveItem {
  key: string;
  title: string;
  detail: string;
  status: Status;
}

const LOOK: Record<Status, { word: string; icon: IconName; tone: ColorName; stroke: number }> = {
  found: { word: 'Found', icon: 'tick', tone: 'greenInk', stroke: 3 },
  missing: { word: 'Missing', icon: 'warning', tone: 'amberInk', stroke: 2.5 },
  unknown: { word: 'Unknown', icon: 'question', tone: 'ink3', stroke: 2.5 },
  none: { word: 'None', icon: 'question', tone: 'ink3', stroke: 2.5 },
};

export function haveItems(product: Product, result: ScoreResult): HaveItem[] {
  const blocks = (input: 'nutrition' | 'ingredients' | 'processing') => result.missing.includes(input);
  const hasIngredients = Boolean(product.ingredientsText?.trim());
  const additives = product.additives;

  return [
    blocks('nutrition')
      ? { key: 'nutrition', title: 'Nutrition facts', detail: 'Needed for the nutrient profile', status: 'missing' }
      : { key: 'nutrition', title: 'Nutrition facts', detail: 'Open Food Facts', status: 'found' },
    hasIngredients
      ? { key: 'ingredients', title: 'Ingredient list', detail: 'Open Food Facts', status: 'found' }
      : {
          key: 'ingredients',
          title: 'Ingredient list',
          detail: 'Needed to check additives',
          status: blocks('ingredients') ? 'missing' : 'none',
        },
    additives !== undefined
      ? {
          key: 'additives',
          title: 'Additives',
          detail: additives.length === 0 ? 'None in the ingredient list' : `${countLabel(additives.length, 'additive', 'additives')} listed`,
          status: 'found',
        }
      : { key: 'additives', title: 'Additives', detail: 'Read from the ingredient list', status: 'unknown' },
    product.novaGroup !== undefined
      ? { key: 'processing', title: 'Processing level', detail: `NOVA group ${product.novaGroup}`, status: 'found' }
      : { key: 'processing', title: 'Processing level', detail: 'Needed for the processing score', status: 'missing' },
    product.imageUrl
      ? { key: 'photo', title: 'Package photo', detail: 'Open Food Facts', status: 'found' }
      : { key: 'photo', title: 'Package photo', detail: 'Not in Open Food Facts yet', status: 'none' },
  ];
}

export function HaveList({ product, result }: { product: Product; result: ScoreResult }) {
  const items = haveItems(product, result);
  const found = items.filter((item) => item.status === 'found').length;
  return (
    <Plate>
      <PlateHeader
        title="What we have"
        right={
          <Txt variant="label" tone="ink3">
            {`${found} of ${items.length}`}
          </Txt>
        }
      />
      {items.map((item) => {
        const look = LOOK[item.status];
        return (
          <ListRow
            key={item.key}
            leading={
              <IconTile icon={look.icon} iconSize={look.icon === 'tick' ? 14 : 15} strokeWidth={look.stroke} iconColor={color[look.tone]} />
            }
            title={item.title}
            detail={item.detail}
            trailing={
              <Txt variant="labelStrong" tone={look.tone} style={styles.word}>
                {look.word}
              </Txt>
            }
            accessibilityLabel={`${item.title}: ${look.word}. ${item.detail}.`}
          />
        );
      })}
    </Plate>
  );
}

const styles = StyleSheet.create({
  word: {
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 0,
  },
});
