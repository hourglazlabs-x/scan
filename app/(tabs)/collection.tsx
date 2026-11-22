// Index (mockup Index): every product scanned, newest first, as a two-column
// grid of entry cards, with search and All / Food / Objects / Flagged filters.

import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HistoryFilter, ScanRecord } from '../../src/data/contracts';
import { useScanHistory } from '../../src/data/hooks';
import { color, radius, shadow, space } from '../../src/theme/tokens';
import { font, text } from '../../src/theme/type';
import { Button } from '../../src/ui/Button';
import { FilterChip } from '../../src/ui/Chip';
import { countLabel, formatBarcode, formatInteger } from '../../src/ui/format';
import { GradeBadge } from '../../src/ui/GradeBadge';
import { Icon } from '../../src/ui/Icon';
import { MessagePlate } from '../../src/ui/MessagePlate';
import { Pictogram, pictogramFor } from '../../src/ui/Pictogram';
import { ScreenTitle } from '../../src/ui/ScreenTitle';
import { useTabBarSpace } from '../../src/ui/TabBar';
import { Txt } from '../../src/ui/Txt';
import { useDebouncedValue } from '../../src/ui/uiHooks';

const FILTERS: ReadonlyArray<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'food', label: 'Food' },
  { id: 'objects', label: 'Objects' },
  { id: 'flagged', label: 'Flagged' },
];

/** A null item pads an odd count, so the last card keeps half the width. */
type GridItem = ScanRecord | null;

export default function IndexScreen() {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [input, setInput] = useState('');
  const query = useDebouncedValue(input.trim(), 200);
  const { loading, records, counts } = useScanHistory(filter, query);

  const data = useMemo<GridItem[]>(() => (records.length % 2 === 1 ? [...records, null] : records), [records]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s1 }]}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <ScreenTitle title="Index" />
          <View
            style={styles.totals}
            accessible
            accessibilityLabel={`${countLabel(counts.all, 'entry', 'entries')}: ${formatInteger(counts.food)} food, ${countLabel(counts.objects, 'object', 'objects')}`}
          >
            <Txt style={styles.totalsMain}>{countLabel(counts.all, 'entry', 'entries')}</Txt>
            <Txt variant="label" tone="ink3">
              {`${formatInteger(counts.food)} food · ${countLabel(counts.objects, 'object', 'objects')}`}
            </Txt>
          </View>
        </View>

        <View style={styles.search}>
          <View style={styles.searchIcon} pointerEvents="none">
            <Icon name="search" size={18} color={color.ink3} />
          </View>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Search your index"
            placeholderTextColor={color.ink3}
            accessibilityLabel="Search your index"
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            maxFontSizeMultiplier={1.6}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          keyboardShouldPersistTaps="handled"
          style={styles.filterStrip}
        >
          {FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              count={f.id === 'all' ? undefined : counts[f.id]}
              selected={filter === f.id}
              onPress={() => setFilter(f.id)}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={data}
        numColumns={2}
        keyExtractor={(item, index) => (item ? String(item.id) : `spacer-${index}`)}
        renderItem={({ item }) => (item ? <EntryCard record={item} /> : <View style={styles.spacer} />)}
        columnWrapperStyle={styles.columns}
        ItemSeparatorComponent={RowGap}
        contentContainerStyle={[styles.list, { paddingBottom: tabSpace + space.s4 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={color.ink3} style={styles.loading} />
          ) : (
            <EmptyState filter={filter} query={query} total={counts.all} />
          )
        }
      />
    </View>
  );
}

function RowGap() {
  return <View style={styles.rowGap} />;
}

function EntryCard({ record }: { record: ScanRecord }) {
  const name = record.name ?? 'Unnamed product';
  const subtitle = record.categoryLabel ?? record.brand ?? formatBarcode(record.code);
  const scoreText = record.score === null ? record.gradeLabel : `${record.score} of 100, ${record.gradeLabel}`;
  const kind = pictogramFor({ categoryLabel: record.categoryLabel, name: record.name });

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/product/[code]', params: { code: record.code, from: 'index' } })}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${scoreText}, ${subtitle}, entry number ${record.entryNumber}`}
      accessibilityHint="Opens the result"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTop}>
        <Pictogram kind={kind} size={40} />
        <GradeBadge grade={record.grade} label={record.gradeLabel} score={record.score} size="sm" />
      </View>
      <View style={styles.cardText}>
        <Txt variant="rowTitle" numberOfLines={2}>
          {name}
        </Txt>
        <Txt variant="label" tone="ink3" numberOfLines={1}>
          {subtitle}
        </Txt>
      </View>
      <Txt style={styles.entryNo} tone="ink3">
        {`No. ${record.entryNumber}`}
      </Txt>
    </Pressable>
  );
}

function EmptyState({ filter, query, total }: { filter: HistoryFilter; query: string; total: number }) {
  if (total === 0 && query.length === 0) {
    return (
      <MessagePlate icon="barcode" title="Scan your first product to start your Index.">
        <Button label="Scan a product" icon="barcode" onPress={() => router.navigate('/')} />
      </MessagePlate>
    );
  }
  if (query.length > 0) {
    return <MessagePlate icon="search" title={`Nothing matches “${query}”`} body="Search looks at the name, the brand and the barcode." />;
  }
  switch (filter) {
    case 'objects':
      return (
        <MessagePlate
          icon="eye"
          title="No objects yet"
          body="Object mode comes in the next phase. Products you scan by barcode are under Food."
        />
      );
    case 'flagged':
      return (
        <MessagePlate
          icon="tick"
          title="Nothing flagged"
          body="Products with a Poor grade or a high-risk additive show up here."
        />
      );
    default:
      return <MessagePlate icon="barcode" title="No entries here yet" body="Scan a product to add it." />;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ground,
  },
  head: {
    paddingHorizontal: space.s4,
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.s3,
  },
  totals: {
    alignItems: 'flex-end',
    gap: 2,
    paddingBottom: 2,
    flexShrink: 1,
  },
  totalsMain: {
    ...text.rowTitle,
  },
  search: {
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.plate,
    ...shadow.card,
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
  },
  searchInput: {
    minHeight: 44,
    paddingLeft: 40,
    paddingRight: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: color.plateRim,
    borderRadius: radius.pill,
    fontFamily: font.sans,
    fontSize: 15,
    color: color.ink,
  },
  filterStrip: {
    flexGrow: 0,
    marginHorizontal: -space.s4,
  },
  filters: {
    gap: space.s2,
    paddingHorizontal: space.s4,
  },
  list: {
    paddingHorizontal: space.s4,
    paddingTop: 10,
  },
  columns: {
    gap: space.s3,
  },
  rowGap: {
    height: space.s3,
  },
  spacer: {
    flex: 1,
  },
  loading: {
    marginTop: space.s6,
  },
  card: {
    flex: 1,
    minHeight: 156,
    gap: space.s2,
    padding: space.s3,
    backgroundColor: color.plate,
    borderWidth: 1,
    borderColor: color.plateRim,
    borderRadius: radius.md,
    ...shadow.card,
  },
  cardPressed: {
    backgroundColor: color.well,
  },
  // Wraps on narrow phones (or large text) so the badge drops under the tile instead of overflowing.
  cardTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.s2,
  },
  cardText: {
    gap: 2,
  },
  entryNo: {
    ...text.micro,
    letterSpacing: 0.22,
    marginTop: 'auto',
  },
});
