// A plate with an ink icon tile, a title, a short explanation and actions,
// after the Missing-data mockup's "Photograph the ingredient list" plate.
// Used for permission prompts, loading, not found, errors and empty states.

import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { color, radius, space } from '../theme/tokens';
import { font } from '../theme/type';
import { Icon, type IconName } from './Icon';
import { Plate } from './Plate';
import { Txt } from './Txt';

export interface MessagePlateProps {
  icon?: IconName;
  /** Shows a spinner in the tile instead of the icon. */
  busy?: boolean;
  title: string;
  body?: string;
  /** Buttons, stacked under the text. */
  children?: ReactNode;
}

export function MessagePlate({ icon = 'question', busy = false, title, body, children }: MessagePlateProps) {
  return (
    <Plate contentStyle={styles.content}>
      <View style={styles.row}>
        <View style={styles.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {busy ? <ActivityIndicator color={color.tileFg} /> : <Icon name={icon} size={22} color={color.tileFg} />}
        </View>
        <View style={styles.text}>
          <Txt style={styles.title} accessibilityRole="header">
            {title}
          </Txt>
          {body ? (
            <Txt style={styles.body} tone="ink2">
              {body}
            </Txt>
          ) : null}
        </View>
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </Plate>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.s4,
    gap: space.s3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.s3,
  },
  tile: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.tile,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: font.sansSemibold,
    fontSize: 16,
    lineHeight: 21,
  },
  body: {
    fontFamily: font.sans,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    gap: space.s2,
  },
});
