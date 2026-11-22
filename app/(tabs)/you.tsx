// You: about the scoring and the data. The rubric version and its draft
// status, every cited source and whether it has been checked, what works
// offline, the data licence and privacy.

import { Linking, StyleSheet, View } from 'react-native';

import { useCacheStats } from '../../src/data/hooks';
import { RUBRIC } from '../../src/rubric/index';
import type { Source } from '../../src/rubric/schema';
import { color, radius, space } from '../../src/theme/tokens';
import { countLabel } from '../../src/ui/format';
import { GradeBadge } from '../../src/ui/GradeBadge';
import { Icon } from '../../src/ui/Icon';
import { ListRow, Plate, PlateHeader, plateStyles } from '../../src/ui/Plate';
import { Screen } from '../../src/ui/Screen';
import { ScreenTitle } from '../../src/ui/ScreenTitle';
import { useTabBarSpace } from '../../src/ui/TabBar';
import { IconTile } from '../../src/ui/Tile';
import { Txt } from '../../src/ui/Txt';

const OFF_URL = 'https://world.openfoodfacts.org';
const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
const CC_BY_SA_URL = 'https://creativecommons.org/licenses/by-sa/3.0/';

function openUrl(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

export default function YouScreen() {
  const tabSpace = useTabBarSpace();
  const { cachedProducts } = useCacheStats();
  const sources = Object.entries(RUBRIC.sources);
  const checkedCount = sources.filter(([, s]) => s.checked).length;
  // Highest band first, each running up to the next grade's minimum.
  const grades = [...RUBRIC.grades].sort((a, b) => b.min - a.min);

  return (
    <Screen scroll bottomSpace={tabSpace + space.s3}>
      <ScreenTitle title="You" />

      <Plate>
        <PlateHeader title="Scoring" right={<StatusBadge draft={RUBRIC.status === 'draft'} />} />
        <View style={plateStyles.padded}>
          <Txt variant="value">{`NUÏTRIX rubric v${RUBRIC.version}`}</Txt>
          {/* RUBRIC.note is for reviewers, so it isn't shown here. */}
          <Txt variant="body" tone="ink2">
            {RUBRIC.status === 'draft'
              ? 'These scores use a draft rulebook that’s still being reviewed. Each rule lists its sources.'
              : 'Each rule lists its sources.'}
          </Txt>
        </View>
        {RUBRIC.pillars.map((pillar) => (
          <ListRow
            key={pillar.id}
            title={pillar.label}
            trailing={
              <Txt variant="label" tone="ink3">
                {`up to ${countLabel(pillar.max, 'point', 'points')}`}
              </Txt>
            }
            accessibilityLabel={`${pillar.label}, up to ${countLabel(pillar.max, 'point', 'points')}`}
          />
        ))}
        {grades.map((grade, i) => {
          const top = i === 0 ? 100 : (grades[i - 1]?.min ?? 101) - 1;
          return (
            <ListRow
              key={grade.id}
              title={`${grade.min}–${top} points`}
              leading={<GradeBadge grade={grade.id} label={grade.label} size="sm" />}
              accessibilityLabel={`${grade.label}: ${grade.min} to ${top} points`}
            />
          );
        })}
      </Plate>

      <Plate>
        <PlateHeader
          title="Sources"
          right={
            <Txt variant="label" tone="ink3">
              {`${checkedCount} of ${countLabel(sources.length, 'source', 'sources')} checked`}
            </Txt>
          }
        />
        {sources.map(([id, source]) => (
          <SourceRow key={id} source={source} />
        ))}
      </Plate>

      <Plate>
        <PlateHeader title="Offline" />
        <ListRow
          leading={<IconTile icon="barcode" iconSize={15} />}
          title={`${countLabel(cachedProducts, 'product', 'products')} saved on this phone`}
          detail="Saved products open and score without signal."
        />
      </Plate>

      <Plate>
        <PlateHeader title="Data" />
        <View style={plateStyles.padded}>
          <Txt variant="body" tone="ink2">
            Product data from Open Food Facts contributors, under the Open Database License (ODbL).
          </Txt>
        </View>
        <ListRow
          title="Open Food Facts"
          detail="world.openfoodfacts.org"
          onPress={() => openUrl(OFF_URL)}
          accessibilityRole="link"
          accessibilityLabel="Open Food Facts"
          accessibilityHint="Opens the website"
          trailing={<Icon name="external" size={14} color={color.ink3} strokeWidth={2.5} />}
        />
        <ListRow
          title="Open Database License 1.0"
          detail="opendatacommons.org"
          onPress={() => openUrl(ODBL_URL)}
          accessibilityRole="link"
          accessibilityLabel="Open Database License 1.0"
          accessibilityHint="Opens the licence"
          trailing={<Icon name="external" size={14} color={color.ink3} strokeWidth={2.5} />}
        />
        <View style={[plateStyles.padded, styles.divided]}>
          <Txt variant="body" tone="ink2">
            Product photos from Open Food Facts are under the Creative Commons Attribution-ShareAlike 3.0 licence (CC BY-SA 3.0).
          </Txt>
        </View>
        <ListRow
          title="CC BY-SA 3.0"
          detail="creativecommons.org"
          onPress={() => openUrl(CC_BY_SA_URL)}
          accessibilityRole="link"
          accessibilityLabel="Creative Commons Attribution-ShareAlike 3.0"
          accessibilityHint="Opens the licence"
          trailing={<Icon name="external" size={14} color={color.ink3} strokeWidth={2.5} />}
        />
      </Plate>

      <Plate>
        <PlateHeader title="Privacy" />
        <View style={plateStyles.padded}>
          <Txt variant="body" tone="ink2">
            Your scans stay on this phone. A lookup sends only the barcode to Open Food Facts.
          </Txt>
        </View>
      </Plate>
    </Screen>
  );
}

/** "Draft" with a warning icon (amber), or "Approved" with a tick (green): icon and word, never colour alone. */
function StatusBadge({ draft }: { draft: boolean }) {
  return (
    <View
      style={[styles.badge, draft ? styles.badgeDraft : styles.badgeApproved]}
      accessible
      accessibilityLabel={draft ? 'Draft rubric' : 'Approved rubric'}
    >
      <Icon
        name={draft ? 'warning' : 'tick'}
        size={12}
        color={draft ? color.amberInk : color.greenInk}
        strokeWidth={draft ? 2.5 : 3}
      />
      <Txt variant="labelStrong" tone={draft ? 'amberInk' : 'greenInk'}>
        {draft ? 'Draft' : 'Approved'}
      </Txt>
    </View>
  );
}

function SourceRow({ source }: { source: Source }) {
  const meta = `${source.publisher} · ${source.year}`;
  const status = (
    <View style={styles.checkRow}>
      <Icon
        name={source.checked ? 'tick' : 'warning'}
        size={12}
        color={source.checked ? color.greenInk : color.amberInk}
        strokeWidth={source.checked ? 3 : 2.5}
      />
      <Txt variant="micro" tone={source.checked ? 'greenInk' : 'amberInk'}>
        {source.checked ? 'Checked' : 'Not yet checked'}
      </Txt>
    </View>
  );
  const detail = (
    <View style={styles.sourceDetail}>
      <Txt variant="label" tone="ink3">
        {meta}
      </Txt>
      {status}
    </View>
  );
  const spoken = `${source.title}. ${meta}. ${source.checked ? 'Checked' : 'Not yet checked'}.`;
  const url = source.url;
  return url ? (
    <ListRow
      title={source.title}
      compactTitle
      detail={detail}
      onPress={() => openUrl(url)}
      accessibilityRole="link"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the source"
      trailing={<Icon name="external" size={14} color={color.ink3} strokeWidth={2.5} />}
      minHeight={56}
    />
  ) : (
    <ListRow title={source.title} compactTitle detail={detail} accessibilityLabel={spoken} minHeight={56} />
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 7,
    paddingRight: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: color.plate,
  },
  badgeDraft: {
    borderColor: color.amber,
  },
  badgeApproved: {
    borderColor: color.plateRim,
  },
  sourceDetail: {
    gap: 2,
    marginTop: 2,
  },
  /** A text block between list rows gets the rows' hairline above it. */
  divided: {
    borderTopWidth: 1,
    borderTopColor: color.hair,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
