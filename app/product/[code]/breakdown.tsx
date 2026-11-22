// Score breakdown (mockup Breakdown): how each pillar adds up, every rule
// the engine applied with its sources, and the summary sentence.

import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { useProductLookup } from '../../../src/data/hooks';
import type { PillarId, PillarResult, RuleHit } from '../../../src/domain/types';
import { formatAdditiveCode } from '../../../src/rubric/format';
import { RUBRIC } from '../../../src/rubric/index';
import type { Source } from '../../../src/rubric/schema';
import { color, radius, space } from '../../../src/theme/tokens';
import { font, text } from '../../../src/theme/type';
import { Button } from '../../../src/ui/Button';
import { RUBRIC_IS_DRAFT, RUBRIC_LINE } from '../../../src/ui/Draft';
import { LOOKUP_ERROR_COPY, countLabel, countedNote, formatPoints, paramValue, spokenPoints } from '../../../src/ui/format';
import { GradeBadge } from '../../../src/ui/GradeBadge';
import { HeaderBar, useGoBack } from '../../../src/ui/Header';
import { Icon } from '../../../src/ui/Icon';
import { MessagePlate } from '../../../src/ui/MessagePlate';
import { ListRow, Plate, PlateHeader, plateStyles } from '../../../src/ui/Plate';
import { Screen } from '../../../src/ui/Screen';
import { Segments } from '../../../src/ui/Segments';
import { IconTile } from '../../../src/ui/Tile';
import { Txt } from '../../../src/ui/Txt';
import { SignedPoints } from '../../../src/ui/WhyPlate';

function openUrl(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

export default function BreakdownScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = paramValue(params.code) ?? '';
  const state = useProductLookup(code.length > 0 ? code : null);
  const goBack = useGoBack(code.length > 0 ? `/product/${code}` : '/');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (state === null || state.status !== 'found') {
    return (
      <Screen scroll>
        <HeaderBar backLabel="Result" onBack={goBack} />
        {state === null || state.status === 'loading' ? (
          <MessagePlate busy title="Loading the breakdown" />
        ) : (
          <MessagePlate
            icon="warning"
            title={state.status === 'not_found' ? 'Not in Open Food Facts yet' : LOOKUP_ERROR_COPY[state.reason].title}
            body={state.status === 'not_found' ? 'There’s no product to break down.' : LOOKUP_ERROR_COPY[state.reason].body}
          >
            <Button label="Back to result" onPress={goBack} />
          </MessagePlate>
        )}
      </Screen>
    );
  }

  const { product, result } = state;
  const pillarOf = (id: PillarId) => result.pillars.find((p) => p.id === id);
  const toggle = (ruleId: string) => setOpen((prev) => ({ ...prev, [ruleId]: !prev[ruleId] }));
  const draft = RUBRIC_IS_DRAFT ? ', draft rubric' : '';
  const spokenScore =
    result.score === null ? `Not scored, ${result.gradeLabel}` : `Score ${result.score} of 100, ${result.gradeLabel}${draft}`;

  return (
    <Screen scroll>
      <HeaderBar backLabel="Result" onBack={goBack} />

      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Txt variant="pageTitle" accessibilityRole="header">
            Score breakdown
          </Txt>
          <Txt style={styles.productName} tone="ink3" numberOfLines={2}>
            {product.name ?? 'Unnamed product'}
          </Txt>
          <Txt variant="micro" tone={RUBRIC_IS_DRAFT ? 'amberInk' : 'ink3'}>
            {RUBRIC_LINE}
          </Txt>
        </View>
        <View style={styles.scoreBlock} accessible accessibilityLabel={spokenScore}>
          <Txt style={styles.score} maxFontSizeMultiplier={1.3}>
            {result.score === null ? '—' : String(result.score)}
          </Txt>
          <GradeBadge grade={result.grade} label={result.gradeLabel} size="inline" />
        </View>
      </View>

      <Plate contentStyle={plateStyles.padded}>
        <Txt variant="sectionTitle" accessibilityRole="header">
          {result.score === null ? 'How the score adds up' : `How ${result.score} adds up`}
        </Txt>
        <View style={styles.pillars}>
          {result.pillars.map((pillar) => (
            <PillarRow key={pillar.id} pillar={pillar} />
          ))}
        </View>
      </Plate>

      <Plate>
        <PlateHeader
          title="Rules applied"
          right={
            <Txt variant="label" tone="ink3">
              {RUBRIC_LINE}
            </Txt>
          }
        />
        {result.hits.length === 0 ? (
          <ListRow title="No rules applied" detail="There was nothing for the rules to check." />
        ) : (
          result.hits.map((hit) => (
            <RuleRow
              key={hit.ruleId}
              hit={hit}
              pillar={pillarOf(hit.pillar)}
              expanded={open[hit.ruleId] === true}
              onToggle={() => toggle(hit.ruleId)}
            />
          ))
        )}
        {result.unrated.length > 0 ? <UnratedRow codes={result.unrated} /> : null}
      </Plate>

      <Plate contentStyle={[plateStyles.padded, styles.summary]}>
        <Txt variant="sectionTitle" accessibilityRole="header">
          Summary
        </Txt>
        <Txt variant="body" tone="ink2">
          {result.summary}
        </Txt>
        <Txt style={styles.note} tone="ink3">
          Written from the rules above. It can’t change the score.
        </Txt>
      </Plate>
    </Screen>
  );
}

function PillarRow({ pillar }: { pillar: PillarResult }) {
  const { value, max } = pillar;
  const spoken =
    value === null
      ? `${pillar.label}: not scored, data missing, out of ${max}`
      : `${pillar.label}: ${value} of ${max}${pillar.capped ? ', capped' : ''}`;
  return (
    <View style={styles.pillarRow} accessible accessibilityLabel={spoken}>
      <Txt style={styles.pillarLabel}>{pillar.label}</Txt>
      <View style={styles.meter}>
        <Segments value={value} max={max} />
      </View>
      <View style={styles.pillarValue}>
        <Txt style={styles.pillarNumbers} align="right" maxFontSizeMultiplier={1.4}>
          {`${value ?? '—'} / ${max}`}
        </Txt>
        {pillar.capped ? (
          <Txt variant="micro" tone="ink3" align="right">
            Capped
          </Txt>
        ) : null}
        {value === null ? (
          <Txt variant="micro" tone="amberInk" align="right">
            Missing
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

interface RuleRowProps {
  hit: RuleHit;
  /** The rule's pillar, for its label and maximum. */
  pillar: PillarResult | undefined;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * One rule. The main number is what the rule counted after its pillar was
 * clamped; when that differs from the rule's own points, a note says why.
 */
function RuleRow({ hit, pillar, expanded, onToggle }: RuleRowProps) {
  const sources = countLabel(hit.sources.length, 'source', 'sources');
  const pillarLabel = pillar?.label ?? hit.pillar;
  const note = countedNote(hit, pillar);
  return (
    <ListRow
      title={hit.label}
      compactTitle
      minHeight={52}
      detail={
        <>
          <Txt variant="label" tone="ink3">
            <Txt style={styles.ruleId} tone="ink3">
              {hit.ruleId}
            </Txt>
            {` · ${pillarLabel} · ${sources}`}
          </Txt>
          {note ? (
            <Txt variant="label" tone="ink2">
              {note}
            </Txt>
          ) : null}
        </>
      }
      trailing={
        <>
          <SignedPoints points={hit.counted} size="sm" />
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={16} color={color.ink3} strokeWidth={2.5} />
        </>
      }
      onPress={onToggle}
      accessibilityLabel={
        note
          ? `${hit.label}, ${spokenPoints(hit.counted)} counted. ${note}. Rule ${hit.ruleId}, ${pillarLabel}, ${sources}.`
          : `${hit.label}, ${spokenPoints(hit.counted)}. Rule ${hit.ruleId}, ${pillarLabel}, ${sources}.`
      }
      accessibilityHint={expanded ? 'Hides the sources' : 'Shows the sources'}
      accessibilityState={{ expanded }}
    >
      {expanded ? (
        <View style={styles.expanded}>
          <Txt variant="label" tone="ink2">
            {hit.counted === hit.points ? hit.detail : `${hit.detail} · Rule value ${formatPoints(hit.points)}`}
          </Txt>
          {hit.sources.map((id) => (
            <SourceLine key={id} id={id} />
          ))}
        </View>
      ) : null}
    </ListRow>
  );
}

function SourceLine({ id }: { id: string }) {
  const source: Source | undefined = RUBRIC.sources[id];
  if (!source) {
    return (
      <Txt variant="label" tone="ink3">
        {`Source “${id}” isn’t in this rubric version.`}
      </Txt>
    );
  }
  const spoken = `${source.title}. ${source.publisher}, ${source.year}.${source.checked ? '' : ' Not yet checked.'}`;
  const body = (
    <>
      <View style={styles.sourceText}>
        <Txt variant="label" tone="ink2">
          {source.title}
        </Txt>
        <Txt style={styles.sourceMeta} tone="ink3">
          {`${source.publisher} · ${source.year}`}
        </Txt>
        {source.checked ? null : (
          <View style={styles.unchecked}>
            <Icon name="warning" size={11} color={color.amberInk} strokeWidth={2.5} />
            <Txt variant="micro" tone="amberInk">
              Not yet checked
            </Txt>
          </View>
        )}
      </View>
      {source.url ? <Icon name="external" size={14} color={color.ink3} strokeWidth={2.5} /> : null}
    </>
  );
  const url = source.url;
  if (url) {
    return (
      <Pressable
        onPress={() => openUrl(url)}
        accessibilityRole="link"
        accessibilityLabel={spoken}
        accessibilityHint="Opens the source"
        style={({ pressed }) => [styles.source, pressed && styles.sourcePressed]}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View style={styles.source} accessible accessibilityLabel={spoken}>
      {body}
    </View>
  );
}

function UnratedRow({ codes }: { codes: string[] }) {
  const list = codes.map(formatAdditiveCode).join(', ');
  const title = `${countLabel(codes.length, 'additive', 'additives')} not yet rated: ${list}`;
  return (
    <ListRow
      leading={<IconTile icon="question" iconSize={15} strokeWidth={2.5} iconColor={color.ink3} />}
      title={title}
      detail="This rubric version doesn’t rate them, so they don’t change the score."
    />
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingTop: 2,
    paddingBottom: space.s1,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
    gap: space.s1,
  },
  productName: {
    ...text.label,
    fontSize: 13,
    lineHeight: 18,
  },
  scoreBlock: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 2,
  },
  score: {
    ...text.numeral,
    fontSize: 28,
    lineHeight: 32,
  },
  pillars: {
    gap: 10,
  },
  pillarRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
  },
  pillarLabel: {
    width: 112,
    fontFamily: font.sansSemibold,
    fontSize: 13.5,
    lineHeight: 18,
  },
  meter: {
    flex: 1,
    minWidth: 0,
  },
  // A minimum, not a fixed width, so "50 / 50" never wraps at large text sizes.
  pillarValue: {
    minWidth: 56,
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  pillarNumbers: {
    fontFamily: font.sansSemibold,
    fontSize: 13.5,
    lineHeight: 18,
  },
  ruleId: {
    fontFamily: font.mono,
    fontSize: 11,
    lineHeight: 16,
  },
  expanded: {
    gap: space.s2,
    paddingHorizontal: space.s4,
    paddingBottom: space.s3,
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: color.well,
  },
  sourcePressed: {
    backgroundColor: color.plateRim,
  },
  sourceText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sourceMeta: {
    ...text.label,
    fontSize: 11,
    lineHeight: 14,
  },
  unchecked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summary: {
    gap: 6,
  },
  note: {
    ...text.label,
    fontSize: 11,
    lineHeight: 14,
  },
});
