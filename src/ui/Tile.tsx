// Square icon tiles: ink tiles with a white glyph (category pictograms,
// action tiles) and light "well" tiles with a coloured marker (rule rows,
// checklists).

import { StyleSheet, View } from 'react-native';

import { color, radius as radii } from '../theme/tokens';
import { Icon, type IconName } from './Icon';

export interface IconTileProps {
  icon: IconName;
  /** Tile size in points. */
  size?: number;
  iconSize?: number;
  variant?: 'ink' | 'well';
  /** Icon colour on a well tile. Ink tiles always use the tile foreground. */
  iconColor?: string;
  strokeWidth?: number;
  radius?: number;
}

export function IconTile({
  icon,
  size = 28,
  iconSize,
  variant = 'well',
  iconColor,
  strokeWidth = 2,
  radius = radii.md,
}: IconTileProps) {
  const ink = variant === 'ink';
  return (
    <View
      style={[styles.tile, ink ? styles.ink : styles.well, { width: size, height: size, borderRadius: radius }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon
        name={icon}
        size={iconSize ?? Math.round(size * 0.5)}
        color={ink ? color.tileFg : (iconColor ?? color.ink)}
        strokeWidth={strokeWidth}
      />
    </View>
  );
}

/** The 28 pt marker in "Why it scored" rows: a minus in red for penalties, a plus in green for bonuses. */
export function PointsMarker({ points }: { points: number }) {
  return (
    <IconTile
      icon={points < 0 ? 'minus' : 'plus'}
      iconSize={14}
      strokeWidth={3}
      iconColor={points < 0 ? color.redInk : color.greenInk}
    />
  );
}

const styles = StyleSheet.create({
  tile: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ink: {
    backgroundColor: color.tile,
  },
  well: {
    backgroundColor: color.well,
  },
});
